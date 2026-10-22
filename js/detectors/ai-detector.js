/**
 * GhostMeta AI - Deep Metadata & AI Radar Detector
 * Analyzes binary ArrayBuffers for C2PA provenance, AI prompts,
 * SynthID indicators, EXIF, IPTC, XMP, and Video container metadata.
 */

export class AIDetector {
  /**
   * Main entry point to detect metadata in a file
   * @param {File} file 
   * @param {ArrayBuffer} buffer 
   * @returns {Promise<Object>} Detection results
   */
  static async detect(file, buffer) {
    const bytes = new Uint8Array(buffer);
    const result = {
      hasAIMetadata: false,
      aiConfidence: 'none', // 'none', 'low', 'medium', 'high'
      detectedSources: [],
      c2pa: null,
      prompts: [],
      modelInfo: [],
      exif: {},
      iptc: {},
      xmp: null,
      gps: null,
      videoAtoms: [],
      rawFindings: []
    };

    const type = file.type || '';
    const name = file.name.toLowerCase();

    // 1. Check for C2PA manifest (Universal across JPEG, PNG, WebP, MP4, MOV)
    const c2paInfo = this.scanC2PA(bytes);
    if (c2paInfo.found) {
      result.hasAIMetadata = true;
      result.c2pa = c2paInfo;
      result.detectedSources.push(c2paInfo.source || 'C2PA Content Credentials');
      result.rawFindings.push(`C2PA Manifest detected (${c2paInfo.sizeFormatted})`);
      if (c2paInfo.generator) {
        result.modelInfo.push(`Claim Generator: ${c2paInfo.generator}`);
      }
    }

    // 2. Format specific analysis
    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || type === 'image/jpeg') {
      this.analyzeJPEG(bytes, result);
    } else if (name.endsWith('.png') || type === 'image/png') {
      this.analyzePNG(bytes, result);
    } else if (name.endsWith('.webp') || type === 'image/webp') {
      this.analyzeWebP(bytes, result);
    } else if (name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.m4v') || type.startsWith('video/')) {
      this.analyzeMP4(bytes, result);
    }

    // 3. Fallback string scan for known AI signatures across both start and end of file buffer
    this.scanKnownAISignatures(bytes, result);

    // 4. Calculate overall confidence
    if (result.c2pa?.found || result.prompts.length > 0) {
      result.aiConfidence = 'high';
      result.hasAIMetadata = true;
    } else if (result.detectedSources.length > 0 || result.modelInfo.length > 0) {
      result.aiConfidence = 'medium';
      result.hasAIMetadata = true;
    } else if (result.hasGPS || Object.keys(result.exif).length > 0) {
      result.aiConfidence = 'privacy-leak';
    }

    return result;
  }

  /**
   * Scans for C2PA / JUMBF manifests
   */
  static scanC2PA(bytes) {
    const textDecoder = new TextDecoder('utf-8', { fatal: false });
    // Scan both header and trailer
    const sample = bytes.length <= 1000000 
      ? bytes 
      : this.concatBytes(bytes.slice(0, 500000), bytes.slice(bytes.length - 500000));
    const fullText = textDecoder.decode(sample);

    const c2paInfo = {
      found: false,
      source: null,
      generator: null,
      sizeFormatted: '0 B',
      details: []
    };

    // Check for C2PA markers
    const hasJumbf = fullText.includes('jumb') || fullText.includes('c2pa') || fullText.includes('urn:c2pa');
    const hasOpenAI = fullText.includes('OpenAI') || fullText.includes('DALL·E') || fullText.includes('ChatGPT');
    const hasAdobe = fullText.includes('Adobe Firefly') || fullText.includes('c2pa.claim');
    const hasGoogle = fullText.includes('Google') && (fullText.includes('SynthID') || fullText.includes('Imagen') || fullText.includes('Gemini'));
    const hasTruepic = fullText.includes('Truepic');
    const hasMicrosoft = fullText.includes('Microsoft Designer') || fullText.includes('Copilot');

    if (hasJumbf || hasOpenAI || hasAdobe || hasGoogle || hasTruepic || hasMicrosoft) {
      c2paInfo.found = true;
      if (hasOpenAI) {
        c2paInfo.source = 'OpenAI (ChatGPT / DALL-E / Sora)';
        c2paInfo.generator = 'OpenAI Provenance Service';
      } else if (hasGoogle) {
        c2paInfo.source = 'Google DeepMind (Gemini / Imagen)';
        c2paInfo.generator = 'Google AI Content Credentials';
      } else if (hasAdobe) {
        c2paInfo.source = 'Adobe Firefly / Content Authenticity';
        c2paInfo.generator = 'Adobe C2PA Service';
      } else if (hasMicrosoft) {
        c2paInfo.source = 'Microsoft Copilot / Designer';
        c2paInfo.generator = 'Microsoft Provenance';
      } else {
        c2paInfo.source = 'C2PA Coalition Content Credentials';
      }

      const match = fullText.match(/c2pa[\s\S]{10,200}/);
      if (match) {
        c2paInfo.details.push(match[0].slice(0, 120));
      }
    }

    return c2paInfo;
  }

  /**
   * Analyzes JPEG markers (APP1, APP2, APP11, APP13, COM)
   */
  static analyzeJPEG(bytes, result) {
    let offset = 2;
    const len = bytes.length;

    while (offset < len - 1) {
      if (bytes[offset] !== 0xFF) break;
      const marker = bytes[offset + 1];
      offset += 2;

      // Standalone markers without length
      if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
        continue;
      }

      if (marker === 0xDA) {
        // Start of Scan
        break;
      }

      if (offset + 2 > len) break;
      const markerLength = (bytes[offset] << 8) | bytes[offset + 1];
      const payloadStart = offset + 2;
      const payloadEnd = offset + markerLength;

      if (payloadEnd > len) break;
      const payload = bytes.slice(payloadStart, payloadEnd);

      // APP1: EXIF or XMP
      if (marker === 0xE1) {
        const header = new TextDecoder().decode(payload.slice(0, 28));
        if (header.startsWith('Exif')) {
          this.parseExif(payload.slice(6), result);
        } else if (header.includes('http://ns.adobe.com/xap')) {
          this.parseXMP(payload, result);
        }
      }
      // APP2: ICC or C2PA JUMBF
      else if (marker === 0xE2) {
        const str = new TextDecoder().decode(payload.slice(0, 16));
        if (str.includes('JPUM') || str.includes('c2pa')) {
          result.hasAIMetadata = true;
          result.rawFindings.push('JPEG APP2 C2PA JUMBF Box detected');
        }
      }
      // APP11: JPEG-XT / C2PA JUMBF
      else if (marker === 0xEB) {
        result.hasAIMetadata = true;
        result.rawFindings.push('JPEG APP11 JUMBF Container detected');
      }
      // APP13: Photoshop IRB / IPTC
      else if (marker === 0xED) {
        this.parseIPTC(payload, result);
      }
      // COM: Comment
      else if (marker === 0xFE) {
        const comment = new TextDecoder().decode(payload);
        if (comment.length > 0) {
          result.rawFindings.push(`Comment: "${comment.slice(0, 100)}"`);
          if (comment.includes('Steps:') || comment.includes('Prompt:') || comment.includes('Sampler:')) {
            result.prompts.push({ source: 'JPEG Comment', text: comment });
            result.hasAIMetadata = true;
          }
        }
      }

      offset = payloadEnd;
    }
  }

  /**
   * Analyzes PNG chunks (IHDR, tEXt, zTXt, iTXt, eXIf, etc.)
   */
  static analyzePNG(bytes, result) {
    let offset = 8;
    const len = bytes.length;

    while (offset + 8 <= len) {
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;

      if (dataEnd > len) break;
      const data = bytes.slice(dataStart, dataEnd);

      if (type === 'tEXt') {
        this.parsePNGText(data, result, false);
      } else if (type === 'iTXt') {
        this.parsePNGiTXt(data, result);
      } else if (type === 'zTXt') {
        this.parsePNGText(data, result, true);
      } else if (type === 'eXIf') {
        result.rawFindings.push('PNG eXIf chunk detected');
        this.parseExif(data, result);
      } else if (type === 'caPt' || type === 'c2pa' || type === 'jumb') {
        result.hasAIMetadata = true;
        result.rawFindings.push(`PNG ${type} (C2PA Manifest) detected`);
      }

      offset = dataEnd + 4;
      if (type === 'IEND') break;
    }
  }

  static parsePNGText(data, result, isCompressed = false) {
    let nullIdx = data.indexOf(0);
    if (nullIdx === -1) nullIdx = data.length;

    const keyword = new TextDecoder().decode(data.slice(0, nullIdx));
    let text = '';

    if (!isCompressed && nullIdx < data.length) {
      text = new TextDecoder().decode(data.slice(nullIdx + 1));
    } else {
      text = `[Compressed data: ${data.length} bytes]`;
    }

    result.rawFindings.push(`PNG Chunk [${keyword}]: ${text.slice(0, 100)}`);

    if (keyword === 'parameters' || keyword === 'prompt' || keyword === 'workflow') {
      result.hasAIMetadata = true;
      result.detectedSources.push(keyword === 'workflow' ? 'ComfyUI Workflow' : 'Stable Diffusion / A1111');
      result.prompts.push({
        source: `PNG ${keyword}`,
        text: text
      });
    } else if (keyword === 'Description' || keyword === 'Comment') {
      if (text.includes('--v ') || text.includes('--ar ') || text.includes('Job ID:')) {
        result.hasAIMetadata = true;
        result.detectedSources.push('Midjourney');
        result.prompts.push({ source: 'Midjourney Prompt', text: text });
      } else if (text.includes('Steps:') || text.includes('Model:')) {
        result.hasAIMetadata = true;
        result.prompts.push({ source: 'AI Parameters', text: text });
      }
    } else if (keyword === 'Software' && (text.includes('ComfyUI') || text.includes('Automatic1111') || text.includes('DALL-E') || text.includes('NovelAI'))) {
      result.hasAIMetadata = true;
      result.modelInfo.push(`Software: ${text}`);
    }
  }

  static parsePNGiTXt(data, result) {
    const nullIdx = data.indexOf(0);
    if (nullIdx === -1) return;
    const keyword = new TextDecoder().decode(data.slice(0, nullIdx));
    const text = new TextDecoder().decode(data.slice(nullIdx + 5));

    result.rawFindings.push(`PNG iTXt [${keyword}]: ${text.slice(0, 100)}`);

    if (keyword === 'parameters' || keyword === 'prompt' || keyword === 'workflow') {
      result.hasAIMetadata = true;
      result.detectedSources.push('Stable Diffusion / ComfyUI');
      result.prompts.push({ source: `PNG iTXt ${keyword}`, text: text });
    } else if (text.includes('c2pa') || text.includes('jumbf')) {
      result.hasAIMetadata = true;
      result.rawFindings.push('C2PA manifest inside PNG iTXt');
    }
  }

  static analyzeWebP(bytes, result) {
    if (bytes.length < 12) return;
    const header = new TextDecoder().decode(bytes.slice(0, 4));
    const format = new TextDecoder().decode(bytes.slice(8, 12));
    if (header !== 'RIFF' || format !== 'WEBP') return;

    let offset = 12;
    const len = bytes.length;

    while (offset + 8 <= len) {
      const fourCC = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      const chunkSize = (bytes[offset + 4]) | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
      const dataStart = offset + 8;
      const dataEnd = dataStart + chunkSize;

      if (dataEnd > len) break;
      const data = bytes.slice(dataStart, dataEnd);

      if (fourCC === 'EXIF') {
        result.rawFindings.push('WebP EXIF chunk detected');
        this.parseExif(data, result);
      } else if (fourCC === 'XMP ') {
        result.rawFindings.push('WebP XMP chunk detected');
        this.parseXMP(data, result);
      } else if (fourCC === 'JUMB') {
        result.hasAIMetadata = true;
        result.rawFindings.push('WebP C2PA JUMBF Manifest detected');
        result.detectedSources.push('C2PA Content Credentials');
      }

      offset = dataEnd + (chunkSize % 2);
    }
  }

  /**
   * Analyzes MP4 / MOV ISOBMFF box structure safely using DataView
   */
  static analyzeMP4(bytes, result) {
    let offset = 0;
    const len = bytes.length;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    while (offset + 8 <= len) {
      let boxSize = view.getUint32(offset, false);
      let headerSize = 8;

      const boxType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      );

      if (boxSize === 0) {
        boxSize = len - offset;
      } else if (boxSize === 1) {
        if (offset + 16 > len) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        boxSize = high * 4294967296 + low;
        headerSize = 16;
      }

      if (boxSize < headerSize || isNaN(boxSize)) break;
      const boxEnd = Math.min(len, offset + boxSize);

      result.videoAtoms.push({ type: boxType, size: boxSize, offset });

      // C2PA uuid box: UUID d8fec3d6-1b0e-483c-9297-5828877aae48
      if (boxType === 'uuid') {
        const uuidBytes = bytes.slice(offset + headerSize, Math.min(offset + headerSize + 16, boxEnd));
        const uuidHex = Array.from(uuidBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        if (uuidHex.includes('d8fec3d6') || uuidHex.includes('c2pa')) {
          result.hasAIMetadata = true;
          result.detectedSources.push('C2PA Video Manifest (UUID)');
          result.rawFindings.push('MP4 C2PA Content Credentials UUID box detected');
        } else {
          result.hasAIMetadata = true;
          result.detectedSources.push('Vendor UUID Box');
          result.rawFindings.push(`MP4 Custom UUID Box: ${uuidHex.slice(0, 16)}...`);
        }
      }

      // Check User Data (udta) or meta at top level
      if (boxType === 'udta') {
        result.hasAIMetadata = true;
        result.detectedSources.push('MP4 User Data (udta)');
        result.rawFindings.push('Top-level udta (User Data) box present');
      }

      // Check moov -> udta / meta
      if (boxType === 'moov') {
        const moovData = bytes.slice(offset + headerSize, boxEnd);
        this.scanMoovForMetadata(moovData, result);
      }

      offset = boxEnd;
    }
  }

  /**
   * Scans inside moov atom for udta, meta, and AI video generators
   */
  static scanMoovForMetadata(moovBytes, result) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(moovBytes);

    if (text.includes('udta')) {
      result.hasAIMetadata = true;
      if (!result.detectedSources.includes('MP4 User Data (udta)')) {
        result.detectedSources.push('MP4 User Data (udta)');
      }
      result.rawFindings.push('MP4/MOV moov > udta (User Data) box detected');
    }
    if (text.includes('meta') || text.includes('ilst')) {
      result.hasAIMetadata = true;
      if (!result.detectedSources.includes('QuickTime Metadata (ilst)')) {
        result.detectedSources.push('QuickTime Metadata (ilst)');
      }
      result.rawFindings.push('MP4/MOV meta / ilst box detected');
    }

    // AI Video generators & encoders
    const aiGenerators = [
      { name: 'Pixzora / Omni AI Video', match: /pixzora|omni|pixverse/i },
      { name: 'OpenAI Sora', match: /sora|openai/i },
      { name: 'Runway Gen-2/Gen-3', match: /runway|gen-2|gen-3/i },
      { name: 'Pika Labs', match: /pika|pika_core/i },
      { name: 'Hailuo / MiniMax', match: /hailuo|minimax/i },
      { name: 'Kling AI', match: /kling/i },
      { name: 'Luma Dream Machine', match: /luma/i },
      { name: 'HeyGen / AI Avatar', match: /heygen/i },
      { name: 'Topaz Video AI', match: /topaz/i },
      { name: 'CapCut Video Metadata', match: /capcut/i },
      { name: 'Veo / Google DeepMind', match: /veo|deepmind/i }
    ];

    for (const gen of aiGenerators) {
      if (gen.match.test(text)) {
        result.hasAIMetadata = true;
        if (!result.detectedSources.includes(gen.name)) {
          result.detectedSources.push(gen.name);
        }
        result.modelInfo.push(`Video Generator signature: ${gen.name}`);
        result.rawFindings.push(`Detected signature: ${gen.name}`);
      }
    }
  }

  static parseXMP(payload, result) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(payload);
    result.xmp = text;

    if (text.includes('trainedAlgorithmicMedia') || text.includes('compositeWithTrainedAlgorithmicMedia')) {
      result.hasAIMetadata = true;
      result.detectedSources.push('IPTC: trainedAlgorithmicMedia (AI Generated)');
      result.modelInfo.push('DigitalSourceType: trainedAlgorithmicMedia');
    }

    if (text.includes('Google') && (text.includes('Imagen') || text.includes('SynthID') || text.includes('Gemini'))) {
      result.hasAIMetadata = true;
      result.detectedSources.push('Google Gemini / Imagen (SynthID)');
    }

    if (text.includes('Adobe Firefly')) {
      result.hasAIMetadata = true;
      result.detectedSources.push('Adobe Firefly');
      result.modelInfo.push('CreatorTool: Adobe Firefly');
    }

    if (text.includes('DALL-E') || text.includes('ChatGPT')) {
      result.hasAIMetadata = true;
      result.detectedSources.push('OpenAI ChatGPT / DALL-E');
    }

    if (text.includes('Midjourney')) {
      result.hasAIMetadata = true;
      result.detectedSources.push('Midjourney');
    }

    const promptMatch = text.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i) ||
                        text.match(/photoshop:Credit="([^"]+)"/i);
    if (promptMatch && promptMatch[1]) {
      const extracted = promptMatch[1].trim();
      if (extracted.length > 5) {
        result.prompts.push({ source: 'XMP Description', text: extracted });
      }
    }
  }

  static parseIPTC(payload, result) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(payload);
    if (text.includes('trainedAlgorithmicMedia')) {
      result.hasAIMetadata = true;
      result.detectedSources.push('IPTC DigitalSourceType (AI Generated)');
    }
    if (text.includes('DALL-E') || text.includes('ChatGPT') || text.includes('Midjourney')) {
      result.hasAIMetadata = true;
    }
  }

  static parseExif(payload, result) {
    try {
      const isLittleEndian = payload[0] === 0x49 && payload[1] === 0x49;
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

      const tiffCheck = isLittleEndian ? view.getUint16(2, true) : view.getUint16(2, false);
      if (tiffCheck !== 0x002A) return;

      const firstIFD = isLittleEndian ? view.getUint32(4, true) : view.getUint32(4, false);
      let offset = firstIFD;

      if (offset + 2 > payload.byteLength) return;
      const numEntries = isLittleEndian ? view.getUint16(offset, true) : view.getUint16(offset, false);
      offset += 2;

      for (let i = 0; i < numEntries && offset + 12 <= payload.byteLength; i++) {
        const tag = isLittleEndian ? view.getUint16(offset, true) : view.getUint16(offset, false);
        const valOffset = isLittleEndian ? view.getUint32(offset + 8, true) : view.getUint32(offset + 8, false);

        if (tag === 0x010F) result.exif.Make = 'Detected';
        if (tag === 0x0110) result.exif.Model = 'Detected';
        if (tag === 0x0131) {
          result.exif.Software = 'Detected';
          if (valOffset < payload.byteLength) {
            const str = new TextDecoder().decode(payload.slice(valOffset, Math.min(valOffset + 64, payload.byteLength)));
            result.exif.SoftwareName = str.replace(/\x00/g, '');
            if (/midjourney|dall-e|stablediffusion|comfyui|novelai/i.test(str)) {
              result.hasAIMetadata = true;
              result.modelInfo.push(`Software: ${result.exif.SoftwareName}`);
            }
          }
        }
        if (tag === 0x8825) {
          result.hasGPS = true;
          result.gps = { detected: true };
          result.rawFindings.push('🚨 GPS Geolocation coordinates detected in EXIF');
        }

        offset += 12;
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Fast scan for known AI keywords across raw buffer bytes (header and trailer)
   */
  static scanKnownAISignatures(bytes, result) {
    const headSize = Math.min(bytes.length, 500000);
    const tailStart = Math.max(0, bytes.length - 500000);
    const sample = bytes.length <= 1000000 
      ? bytes 
      : this.concatBytes(bytes.slice(0, headSize), bytes.slice(tailStart));

    const sampleText = new TextDecoder('utf-8', { fatal: false }).decode(sample);

    const signatures = [
      { name: 'Stable Diffusion / ComfyUI Node Graph', regex: /"class_type":\s*"(KSampler|VAEDecode|CLIPTextEncode)"/ },
      { name: 'Automatic1111 WebUI Parameters', regex: /Negative prompt:[\s\S]{5,100}Steps:\s*\d+/ },
      { name: 'Midjourney Generation Flags', regex: /--v\s+[4-6]|--ar\s+\d+:\d+|--stylize\s+\d+/ },
      { name: 'NovelAI Metadata', regex: /"Software":\s*"NovelAI"/ },
      { name: 'DALL-E 3 Generation', regex: /dall-e-3|dall·e 3/i },
      { name: 'Google SynthID Provenance', regex: /synthid|trainedalgorithmicmedia/i },
      { name: 'Pixzora / Omni AI Video', regex: /pixzora|omni_commercial|omni_reel/i },
      { name: 'Runway ML Video Metadata', regex: /runwayml|gen2|gen3/i },
      { name: 'Pika Labs Video', regex: /pika-labs|pika_core/i },
      { name: 'Kling AI Video', regex: /klingai|kling_video/i },
      { name: 'Luma Dream Machine', regex: /dreammachine|luma_ai/i },
      { name: 'Hailuo AI Video', regex: /hailuo|minimax/i }
    ];

    for (const sig of signatures) {
      if (sig.regex.test(sampleText) && !result.detectedSources.includes(sig.name)) {
        result.hasAIMetadata = true;
        result.detectedSources.push(sig.name);
        result.rawFindings.push(`Pattern match: ${sig.name}`);
      }
    }
  }

  static concatBytes(a, b) {
    const c = new Uint8Array(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
  }
}
