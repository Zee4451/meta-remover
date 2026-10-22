/**
 * GhostMeta AI - Synthetic AI Sample Generator
 * Generates realistic test images and video files with authentic AI metadata:
 * - Stable Diffusion / ComfyUI PNG with prompts & node graph
 * - ChatGPT / DALL-E 3 & Gemini JPEG with C2PA manifest & IPTC trainedAlgorithmicMedia
 * - AI Video MP4 container with Runway / Sora metadata & UUID boxes
 */

export class SampleGenerator {
  /**
   * Creates a sample PNG with Stable Diffusion & ComfyUI metadata
   */
  static async createSDSample() {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    // Draw stylish AI artwork pattern
    const grad = ctx.createLinearGradient(0, 0, 400, 400);
    grad.addColorStop(0, '#7928ca');
    grad.addColorStop(0.5, '#ff0080');
    grad.addColorStop(1, '#00dfd8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 400);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Stable Diffusion Artwork', 200, 180);

    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Contains embedded prompt & ComfyUI workflow', 200, 220);

    // Get basic PNG blob
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Inject 'parameters' tEXt chunk
    const promptText = 'parameters\x00A cybernetic neon oracle gazing into a quantum matrix sphere, bioluminescent intricate cyberware, hyper-detailed, raytracing, cinematic lighting\nNegative prompt: ugly, blurry, deformed, bad anatomy, duplicate, lowres\nSteps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7.0, Seed: 429184719, Size: 512x512, Model: CyberRealistic_v4.2';
    const textChunk = this.createPNGChunk('tEXt', new TextEncoder().encode(promptText));

    // Inject ComfyUI 'workflow' tEXt chunk
    const workflowJSON = 'workflow\x00{"last_node_id":9,"nodes":[{"id":4,"type":"CheckpointLoaderSimple","outputs":[{"name":"MODEL","type":"MODEL"}]},{"id":6,"type":"CLIPTextEncode","inputs":{"text":"cybernetic oracle neon"}}]}';
    const workflowChunk = this.createPNGChunk('tEXt', new TextEncoder().encode(workflowJSON));

    // Insert chunks right before IEND
    const iendIndex = bytes.length - 12;
    const newLength = bytes.length + textChunk.length + workflowChunk.length;
    const finalBytes = new Uint8Array(newLength);

    finalBytes.set(bytes.slice(0, iendIndex), 0);
    finalBytes.set(textChunk, iendIndex);
    finalBytes.set(workflowChunk, iendIndex + textChunk.length);
    finalBytes.set(bytes.slice(iendIndex), iendIndex + textChunk.length + workflowChunk.length);

    return new File([finalBytes], 'sample_stable_diffusion.png', { type: 'image/png' });
  }

  /**
   * Creates a sample JPEG with DALL-E 3 C2PA manifest & Google Gemini IPTC tags
   */
  static async createDalleGeminiSample() {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(200, 200, 20, 200, 200, 220);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(0.5, '#3b82f6');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 400);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ChatGPT / Gemini Sample', 200, 180);

    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Contains C2PA Credentials & SynthID tag', 200, 220);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Build APP11 C2PA JUMBF manifest packet
    const c2paStr = 'JPUM\x00c2pa.claim\x00urn:c2pa:OpenAI:DALL-E-3:Provenance:claim_generator=OpenAI DALL·E 3 Signature=sha256:8f4c71b9e2';
    const c2paPayload = new TextEncoder().encode(c2paStr);
    const app11Chunk = this.createJPEGMarker(0xEB, c2paPayload);

    // Build APP13 IPTC packet with Google Gemini DigitalSourceType
    const iptcHeader = new TextEncoder().encode('Photoshop 3.0');
    const iptcBody = new TextEncoder().encode('8BIM--http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia Software: Google Gemini Imagen 3');
    const iptcPayload = new Uint8Array(iptcHeader.length + 1 + iptcBody.length);
    iptcPayload.set(iptcHeader, 0);
    iptcPayload[iptcHeader.length] = 0; // null separator
    iptcPayload.set(iptcBody, iptcHeader.length + 1);
    const app13Chunk = this.createJPEGMarker(0xED, iptcPayload);

    // Insert markers right after SOI (0xFF, 0xD8)
    const newBytes = new Uint8Array(bytes.length + app11Chunk.length + app13Chunk.length);
    newBytes.set(bytes.slice(0, 2), 0);
    newBytes.set(app11Chunk, 2);
    newBytes.set(app13Chunk, 2 + app11Chunk.length);
    newBytes.set(bytes.slice(2), 2 + app11Chunk.length + app13Chunk.length);

    return new File([newBytes], 'sample_chatgpt_gemini.jpg', { type: 'image/jpeg' });
  }

  /**
   * Creates a sample MP4 video with Runway & C2PA video metadata
   */
  static async createVideoSample() {
    // Minimal valid ISOBMFF MP4 file structure
    // ftyp + moov (with udta & ai tags) + mdat
    const ftyp = this.createMP4Box('ftyp', new Uint8Array([
      0x69, 0x73, 0x6F, 0x6D, // isom
      0x00, 0x00, 0x02, 0x00, // minor version
      0x69, 0x73, 0x6F, 0x6D, 0x6D, 0x70, 0x34, 0x31 // compatible brands
    ]));

    // C2PA UUID Box
    const c2paUUID = new Uint8Array([
      0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7a, 0xae, 0x48, // C2PA standard UUID
      ...new TextEncoder().encode('urn:c2pa:RunwayML:Gen-3:claim:OpenAI:Sora:AI-Generated-Video')
    ]);
    const uuidBox = this.createMP4Box('uuid', c2paUUID);

    // moov with udta
    const udtaPayload = new TextEncoder().encode('udta metadata: Generated with Runway Gen-3 Alpha & OpenAI Sora preview. Prompt: drone flying over volcanic Iceland.');
    const udtaBox = this.createMP4Box('udta', udtaPayload);
    const mvhdBox = this.createMP4Box('mvhd', new Uint8Array(100)); // dummy mvhd
    
    const moovPayload = new Uint8Array(mvhdBox.length + udtaBox.length);
    moovPayload.set(mvhdBox, 0);
    moovPayload.set(udtaBox, mvhdBox.length);
    const moovBox = this.createMP4Box('moov', moovPayload);

    // dummy mdat
    const mdatBox = this.createMP4Box('mdat', new Uint8Array(256));

    const totalLen = ftyp.length + uuidBox.length + moovBox.length + mdatBox.length;
    const mp4Bytes = new Uint8Array(totalLen);
    let cur = 0;
    mp4Bytes.set(ftyp, cur); cur += ftyp.length;
    mp4Bytes.set(uuidBox, cur); cur += uuidBox.length;
    mp4Bytes.set(moovBox, cur); cur += moovBox.length;
    mp4Bytes.set(mdatBox, cur); cur += mdatBox.length;

    return new File([mp4Bytes], 'sample_ai_video_runway.mp4', { type: 'video/mp4' });
  }

  // Helper: Create PNG chunk with CRC
  static createPNGChunk(type, data) {
    const len = data.length;
    const chunk = new Uint8Array(4 + 4 + len + 4);
    // Length
    chunk[0] = (len >> 24) & 0xFF;
    chunk[1] = (len >> 16) & 0xFF;
    chunk[2] = (len >> 8) & 0xFF;
    chunk[3] = len & 0xFF;
    // Type
    for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
    // Data
    chunk.set(data, 8);
    // Dummy CRC32 (valid for parser)
    const crc = 0xAA55AA55;
    chunk[8 + len] = (crc >> 24) & 0xFF;
    chunk[8 + len + 1] = (crc >> 16) & 0xFF;
    chunk[8 + len + 2] = (crc >> 8) & 0xFF;
    chunk[8 + len + 3] = crc & 0xFF;
    return chunk;
  }

  // Helper: Create JPEG marker with length
  static createJPEGMarker(marker, payload) {
    const len = payload.length + 2;
    const bytes = new Uint8Array(2 + 2 + payload.length);
    bytes[0] = 0xFF;
    bytes[1] = marker;
    bytes[2] = (len >> 8) & 0xFF;
    bytes[3] = len & 0xFF;
    bytes.set(payload, 4);
    return bytes;
  }

  // Helper: Create ISOBMFF MP4 Box
  static createMP4Box(type, payload) {
    const size = 8 + payload.length;
    const box = new Uint8Array(size);
    box[0] = (size >> 24) & 0xFF;
    box[1] = (size >> 16) & 0xFF;
    box[2] = (size >> 8) & 0xFF;
    box[3] = size & 0xFF;
    for (let i = 0; i < 4; i++) box[4 + i] = type.charCodeAt(i);
    box.set(payload, 8);
    return box;
  }
}
