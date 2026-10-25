/**
 * GhostMeta AI - Stealth Camera EXIF & Hardware Spoofer
 * Injects authentic camera, lens, color profile, and exposure tags
 * (Apple iPhone 16 Pro, Sony Alpha A7 IV, Canon EOS R5, Fujifilm X-T5)
 * without GPS to bypass social media algorithm flagging (Instagram, TikTok, LinkedIn).
 */

export const CAMERA_PROFILES = {
  'iphone-16-pro': {
    id: 'iphone-16-pro',
    name: 'Apple iPhone 16 Pro',
    category: 'Smartphone (Best for Instagram, TikTok, Threads)',
    make: 'Apple',
    model: 'iPhone 16 Pro',
    software: '18.1',
    lensMake: 'Apple',
    lensModel: 'iPhone 16 Pro back triple camera 6.765mm f/1.78',
    fNumber: [178, 100],          // f/1.78
    exposureTime: [1, 120],       // 1/120s
    exposureProgram: 2,           // Normal program
    iso: 64,
    focalLength: [6765, 1000],    // 6.765mm
    focalLength35mm: 24,          // 24mm equivalent
    shutterSpeed: [6907, 1000],   // apex ~6.91
    apertureValue: [1664, 1000],  // apex ~1.66
    brightnessValue: [5824, 1000],// ~5.82
    exposureBias: [0, 10],
    meteringMode: 5,              // Pattern
    colorSpace: 1,                // sRGB
    sensingMethod: 2,             // One-chip color area sensor
    sceneType: 1,                 // Directly photographed
    lensSpecification: [[222, 100], [900, 100], [178, 100], [280, 100]]
  },
  'sony-a7iv': {
    id: 'sony-a7iv',
    name: 'Sony Alpha A7 IV',
    category: 'Full-Frame Mirrorless (Best for LinkedIn & Professional)',
    make: 'SONY',
    model: 'ILCE-7M4',
    software: 'ILCE-7M4 v2.01',
    lensMake: 'Sony',
    lensModel: 'FE 24-70mm F2.8 GM II',
    fNumber: [28, 10],            // f/2.8
    exposureTime: [1, 250],       // 1/250s
    exposureProgram: 3,           // Aperture-priority AE
    iso: 100,
    focalLength: [350, 10],       // 35mm
    focalLength35mm: 35,
    shutterSpeed: [7965, 1000],
    apertureValue: [2970, 1000],
    brightnessValue: [7100, 1000],
    exposureBias: [0, 10],
    meteringMode: 5,
    colorSpace: 1,
    sensingMethod: 2,
    sceneType: 1,
    lensSpecification: [[240, 10], [700, 10], [28, 10], [28, 10]]
  },
  'canon-eos-r5': {
    id: 'canon-eos-r5',
    name: 'Canon EOS R5',
    category: 'Pro Studio / Commercial Photo & Video',
    make: 'Canon',
    model: 'Canon EOS R5',
    software: 'Firmware Version 1.8.1',
    lensMake: 'Canon',
    lensModel: 'RF24-70mm F2.8 L IS USM',
    fNumber: [28, 10],            // f/2.8
    exposureTime: [1, 200],       // 1/200s
    exposureProgram: 1,           // Manual
    iso: 100,
    focalLength: [500, 10],       // 50mm
    focalLength35mm: 50,
    shutterSpeed: [7643, 1000],
    apertureValue: [2970, 1000],
    brightnessValue: [6850, 1000],
    exposureBias: [0, 10],
    meteringMode: 5,
    colorSpace: 1,
    sensingMethod: 2,
    sceneType: 1,
    lensSpecification: [[240, 10], [700, 10], [28, 10], [28, 10]]
  },
  'fujifilm-xt5': {
    id: 'fujifilm-xt5',
    name: 'Fujifilm X-T5',
    category: 'Film Simulation Aesthetic (Best for X / Twitter & Reddit)',
    make: 'FUJIFILM',
    model: 'X-T5',
    software: 'Digital Camera X-T5 Ver.2.10',
    lensMake: 'FUJIFILM',
    lensModel: 'XF33mmF1.4 R LM WR',
    fNumber: [14, 10],            // f/1.4
    exposureTime: [1, 500],       // 1/500s
    exposureProgram: 3,           // Aperture-priority
    iso: 125,
    focalLength: [330, 10],       // 33mm
    focalLength35mm: 50,
    shutterSpeed: [8965, 1000],
    apertureValue: [970, 1000],
    brightnessValue: [7450, 1000],
    exposureBias: [0, 10],
    meteringMode: 5,
    colorSpace: 1,
    sensingMethod: 2,
    sceneType: 1,
    lensSpecification: [[330, 10], [330, 10], [14, 10], [14, 10]]
  }
};

export class CameraSpoofer {
  /**
   * Main injection router: handles JPEG, PNG, WebP, and MP4/MOV
   * @param {Uint8Array|ArrayBuffer} buffer
   * @param {string} profileKey - e.g. 'iphone-16-pro' | 'sony-a7iv' | 'canon-eos-r5'
   * @param {string} mimeType
   * @returns {Uint8Array}
   */
  static inject(buffer, profileKey = 'iphone-16-pro', mimeType = '') {
    let bytes;
    if (buffer instanceof Uint8Array) {
      bytes = buffer;
    } else if (buffer && buffer.buffer) {
      bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      bytes = new Uint8Array(buffer);
    }

    const profile = CAMERA_PROFILES[profileKey] || CAMERA_PROFILES['iphone-16-pro'];

    // 1. JPEG
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      return this.injectIntoJPEG(bytes, profile);
    }

    // 2. PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return this.injectIntoPNG(bytes, profile);
    }

    // 3. WebP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return this.injectIntoWebP(bytes, profile);
    }

    // 4. MP4 / MOV Video
    const typeStr = (mimeType || '').toLowerCase();
    const isISOBMFF = (bytes.length >= 8 &&
      String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp');
    if (isISOBMFF || typeStr.startsWith('video/')) {
      return this.injectIntoMP4(bytes, profile);
    }

    // Default passthrough if unknown format
    return bytes;
  }

  /**
   * Builds authentic Little-Endian TIFF EXIF binary block (Zero GPS)
   * @param {Object} profile
   * @returns {Uint8Array} Pure TIFF payload
   */
  static buildTIFFBytes(profile) {
    const encoder = new TextEncoder();
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}:${pad(now.getMonth() + 1)}:${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}\0`;

    // 1. Prepare all variable-length data items
    const dataItems = [];
    const allocString = (str) => {
      const arr = encoder.encode(str.endsWith('\0') ? str : (str + '\0'));
      const item = { bytes: arr, offset: 0 };
      dataItems.push(item);
      return item;
    };

    const allocRational = (num, den) => {
      const arr = new Uint8Array(8);
      const v = new DataView(arr.buffer);
      v.setUint32(0, num >>> 0, true);
      v.setUint32(4, den >>> 0, true);
      const item = { bytes: arr, offset: 0 };
      dataItems.push(item);
      return item;
    };

    const allocSRational = (num, den) => {
      const arr = new Uint8Array(8);
      const v = new DataView(arr.buffer);
      v.setInt32(0, num | 0, true);
      v.setInt32(4, den | 0, true);
      const item = { bytes: arr, offset: 0 };
      dataItems.push(item);
      return item;
    };

    const allocRationals4 = (pairs) => {
      const arr = new Uint8Array(32);
      const v = new DataView(arr.buffer);
      for (let i = 0; i < 4; i++) {
        v.setUint32(i * 8, pairs[i][0] >>> 0, true);
        v.setUint32(i * 8 + 4, pairs[i][1] >>> 0, true);
      }
      const item = { bytes: arr, offset: 0 };
      dataItems.push(item);
      return item;
    };

    const dMake = allocString(profile.make);
    const dModel = allocString(profile.model);
    const dSoftware = allocString(profile.software);
    const dDate = allocString(dateStr);
    const dXRes = allocRational(72, 1);
    const dYRes = allocRational(72, 1);

    const dExpTime = allocRational(profile.exposureTime[0], profile.exposureTime[1]);
    const dFNumber = allocRational(profile.fNumber[0], profile.fNumber[1]);
    const dFocalLen = allocRational(profile.focalLength[0], profile.focalLength[1]);
    const dShutterSpeed = allocSRational(profile.shutterSpeed[0], profile.shutterSpeed[1]);
    const dApertureVal = allocRational(profile.apertureValue[0], profile.apertureValue[1]);
    const dBrightVal = allocSRational(profile.brightnessValue[0], profile.brightnessValue[1]);
    const dExpBias = allocSRational(profile.exposureBias[0], profile.exposureBias[1]);
    const dLensSpec = allocRationals4(profile.lensSpecification);
    const dLensMake = allocString(profile.lensMake);
    const dLensModel = allocString(profile.lensModel);
    const dSubSec = allocString('240\0');

    // 2. Define IFD0 entries
    // tag, type (2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL, 7=UNDEFINED), count, item or direct value
    const ifd0Entries = [
      { tag: 0x010F, type: 2, count: dMake.bytes.length, item: dMake },
      { tag: 0x0110, type: 2, count: dModel.bytes.length, item: dModel },
      { tag: 0x0112, type: 3, count: 1, value: 1 }, // Orientation: Normal
      { tag: 0x011A, type: 5, count: 1, item: dXRes },
      { tag: 0x011B, type: 5, count: 1, item: dYRes },
      { tag: 0x0128, type: 3, count: 1, value: 2 }, // ResolutionUnit: Inches
      { tag: 0x0131, type: 2, count: dSoftware.bytes.length, item: dSoftware },
      { tag: 0x0132, type: 2, count: dDate.bytes.length, item: dDate },
      { tag: 0x0213, type: 3, count: 1, value: 1 }, // YCbCrPositioning: Centered
      { tag: 0x8769, type: 4, count: 1, isExifPointer: true } // ExifIFD pointer
    ];

    // 3. Define ExifIFD entries (Zero GPS!)
    const exifEntries = [
      { tag: 0x829A, type: 5, count: 1, item: dExpTime },
      { tag: 0x829D, type: 5, count: 1, item: dFNumber },
      { tag: 0x8822, type: 3, count: 1, value: profile.exposureProgram || 2 },
      { tag: 0x8827, type: 3, count: 1, value: profile.iso },
      { tag: 0x9000, type: 7, count: 4, raw4: [0x30, 0x32, 0x33, 0x32] }, // ExifVersion: 0232
      { tag: 0x9003, type: 2, count: dDate.bytes.length, item: dDate },
      { tag: 0x9004, type: 2, count: dDate.bytes.length, item: dDate },
      { tag: 0x9201, type: 10, count: 1, item: dShutterSpeed },
      { tag: 0x9202, type: 5, count: 1, item: dApertureVal },
      { tag: 0x9203, type: 10, count: 1, item: dBrightVal },
      { tag: 0x9204, type: 10, count: 1, item: dExpBias },
      { tag: 0x9207, type: 3, count: 1, value: profile.meteringMode || 5 },
      { tag: 0x9209, type: 3, count: 1, value: 16 }, // Flash: Off, did not fire
      { tag: 0x920A, type: 5, count: 1, item: dFocalLen },
      { tag: 0x9291, type: 2, count: dSubSec.bytes.length, item: dSubSec },
      { tag: 0xA001, type: 3, count: 1, value: profile.colorSpace || 1 }, // sRGB
      { tag: 0xA002, type: 4, count: 1, value: 4032 }, // PixelXDimension
      { tag: 0xA003, type: 4, count: 1, value: 3024 }, // PixelYDimension
      { tag: 0xA217, type: 3, count: 1, value: profile.sensingMethod || 2 },
      { tag: 0xA301, type: 7, count: 1, raw4: [0x01, 0x00, 0x00, 0x00] }, // Directly photographed
      { tag: 0xA402, type: 3, count: 1, value: 0 }, // ExposureMode: Auto
      { tag: 0xA403, type: 3, count: 1, value: 0 }, // WhiteBalance: Auto
      { tag: 0xA405, type: 3, count: 1, value: profile.focalLength35mm || 24 },
      { tag: 0xA406, type: 3, count: 1, value: 0 }, // SceneCaptureType: Standard
      { tag: 0xA432, type: 5, count: 4, item: dLensSpec },
      { tag: 0xA433, type: 2, count: dLensMake.bytes.length, item: dLensMake },
      { tag: 0xA434, type: 2, count: dLensModel.bytes.length, item: dLensModel }
    ];

    // Sort entries by Tag ID (Required by TIFF specification!)
    ifd0Entries.sort((a, b) => a.tag - b.tag);
    exifEntries.sort((a, b) => a.tag - b.tag);

    // 4. Calculate layout offsets
    const tiffHeaderSize = 8;
    const ifd0Size = 2 + (ifd0Entries.length * 12) + 4;
    const exifOffset = tiffHeaderSize + ifd0Size;
    const exifSize = 2 + (exifEntries.length * 12) + 4;
    let dataOffset = exifOffset + exifSize;

    // Assign data payload offsets
    for (const item of dataItems) {
      item.offset = dataOffset;
      dataOffset += item.bytes.length;
      // 2-byte word align
      if (dataOffset % 2 !== 0) dataOffset++;
    }

    // Allocate buffer
    const tiffBuffer = new Uint8Array(dataOffset);
    const view = new DataView(tiffBuffer.buffer);

    // TIFF Header: 'II' (0x49, 0x49) + 42 (0x002A) + IFD0 offset (8)
    view.setUint16(0, 0x4949, false); // 'II'
    view.setUint16(2, 0x002A, true);  // 42
    view.setUint32(4, 0x00000008, true); // IFD0 offset = 8

    // Write an IFD helper
    const writeIFD = (entries, startOffset) => {
      view.setUint16(startOffset, entries.length, true);
      let cur = startOffset + 2;

      for (const e of entries) {
        view.setUint16(cur, e.tag, true);
        view.setUint16(cur + 2, e.type, true);
        view.setUint32(cur + 4, e.count, true);

        if (e.isExifPointer) {
          view.setUint32(cur + 8, exifOffset, true);
        } else if (e.item) {
          view.setUint32(cur + 8, e.item.offset, true);
        } else if (e.raw4) {
          tiffBuffer[cur + 8] = e.raw4[0];
          tiffBuffer[cur + 9] = e.raw4[1];
          tiffBuffer[cur + 10] = e.raw4[2];
          tiffBuffer[cur + 11] = e.raw4[3];
        } else {
          // Direct value
          if (e.type === 3) { // SHORT
            view.setUint16(cur + 8, e.value || 0, true);
            view.setUint16(cur + 10, 0, true);
          } else if (e.type === 4) { // LONG
            view.setUint32(cur + 8, e.value || 0, true);
          } else {
            view.setUint32(cur + 8, e.value || 0, true);
          }
        }
        cur += 12;
      }
      // Next IFD = 0
      view.setUint32(cur, 0, true);
    };

    // Write IFD0 & ExifIFD
    writeIFD(ifd0Entries, 8);
    writeIFD(exifEntries, exifOffset);

    // Write all data items
    for (const item of dataItems) {
      tiffBuffer.set(item.bytes, item.offset);
    }

    return tiffBuffer;
  }

  /**
   * Injects Camera EXIF into JPEG
   */
  static injectIntoJPEG(jpegBytes, profile) {
    const tiff = this.buildTIFFBytes(profile);
    const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // 'Exif\0\0'
    const app1PayloadLen = 2 + exifHeader.length + tiff.length; // includes 2-byte length itself

    const app1Chunk = new Uint8Array(2 + app1PayloadLen);
    app1Chunk[0] = 0xFF;
    app1Chunk[1] = 0xE1; // APP1 marker
    app1Chunk[2] = (app1PayloadLen >> 8) & 0xFF;
    app1Chunk[3] = app1PayloadLen & 0xFF;
    app1Chunk.set(exifHeader, 4);
    app1Chunk.set(tiff, 4 + exifHeader.length);

    // Splice right after SOI (0xFF, 0xD8)
    const result = new Uint8Array(jpegBytes.length + app1Chunk.length);
    result.set(jpegBytes.subarray(0, 2), 0);
    result.set(app1Chunk, 2);
    result.set(jpegBytes.subarray(2), 2 + app1Chunk.length);

    return result;
  }

  /**
   * Injects Camera EXIF into PNG (eXIf chunk)
   */
  static injectIntoPNG(pngBytes, profile) {
    const tiff = this.buildTIFFBytes(profile);
    const chunkType = new Uint8Array([0x65, 0x58, 0x49, 0x66]); // 'eXIf'
    const chunkLen = tiff.length;

    // eXIf chunk structure: 4-byte len, 4-byte type, data, 4-byte CRC
    const eXIfChunk = new Uint8Array(4 + 4 + chunkLen + 4);
    const view = new DataView(eXIfChunk.buffer);
    view.setUint32(0, chunkLen, false); // Big endian length
    eXIfChunk.set(chunkType, 4);
    eXIfChunk.set(tiff, 8);

    // Calculate CRC32 over type + data
    const crc = this.calculateCRC32(eXIfChunk.subarray(4, 8 + chunkLen));
    view.setUint32(8 + chunkLen, crc, false);

    // Insert right after IHDR chunk (Offset 33 = 8 byte signature + 25 byte IHDR)
    const insertPos = 33;
    const result = new Uint8Array(pngBytes.length + eXIfChunk.length);
    result.set(pngBytes.subarray(0, insertPos), 0);
    result.set(eXIfChunk, insertPos);
    result.set(pngBytes.subarray(insertPos), insertPos + eXIfChunk.length);

    return result;
  }

  /**
   * Injects Camera EXIF into WebP
   */
  static injectIntoWebP(webpBytes, profile) {
    const tiff = this.buildTIFFBytes(profile);
    const pad = tiff.length % 2 !== 0 ? 1 : 0;
    const exifChunkLen = 8 + tiff.length + pad;

    const exifChunk = new Uint8Array(exifChunkLen);
    const v = new DataView(exifChunk.buffer);
    exifChunk[0] = 0x45; // 'E'
    exifChunk[1] = 0x58; // 'X'
    exifChunk[2] = 0x49; // 'I'
    exifChunk[3] = 0x46; // 'F'
    v.setUint32(4, tiff.length, true); // Little endian length in RIFF
    exifChunk.set(tiff, 8);

    // Append EXIF chunk to WebP container and update RIFF size
    const result = new Uint8Array(webpBytes.length + exifChunkLen);
    result.set(webpBytes, 0);
    result.set(exifChunk, webpBytes.length);

    // Update RIFF total size at bytes 4..7
    const resultView = new DataView(result.buffer);
    resultView.setUint32(4, result.length - 8, true);

    // If VP8X is present, set EXIF flag (bit 3)
    if (result.length > 20 &&
        String.fromCharCode(result[12], result[13], result[14], result[15]) === 'VP8X') {
      result[20] |= 0x08; // Set EXIF bit
    }

    return result;
  }

  /**
   * Injects authentic Camera metadata into MP4/MOV container (moov > udta > meta > ilst)
   * Without re-encoding or corrupting chunk offsets!
   */
  static injectIntoMP4(mp4Bytes, profile) {
    const bytes = new Uint8Array(mp4Bytes.slice(0));
    const len = bytes.length;
    const view = new DataView(bytes.buffer);

    const fullUdta = this.buildCameraUdtaAtom(profile, false);
    const compactUdta = this.buildCameraUdtaAtom(profile, true);

    // 1. Search for a 'free' atom inside 'moov'
    let offset = 0;
    while (offset + 8 <= len) {
      let boxSize = view.getUint32(offset, false);
      const boxType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

      if (boxSize === 0) boxSize = len - offset;
      if (boxSize < 8 || isNaN(boxSize)) break;
      const boxEnd = Math.min(len, offset + boxSize);

      if (boxType === 'moov') {
        let mOffset = offset + 8;
        while (mOffset + 8 <= boxEnd) {
          const mSize = view.getUint32(mOffset, false);
          const mType = String.fromCharCode(bytes[mOffset + 4], bytes[mOffset + 5], bytes[mOffset + 6], bytes[mOffset + 7]);

          if (mSize < 8 || isNaN(mSize) || mOffset + mSize > boxEnd) break;

          // Found a 'free' box inside moov
          if (mType === 'free') {
            const chosenUdta = (mSize >= fullUdta.length) ? fullUdta : (mSize >= compactUdta.length ? compactUdta : null);
            if (chosenUdta) {
              bytes.set(chosenUdta, mOffset);
              const remaining = mSize - chosenUdta.length;
              if (remaining >= 8) {
                const remOffset = mOffset + chosenUdta.length;
                view.setUint32(remOffset, remaining, false);
                bytes[remOffset + 4] = 0x66; bytes[remOffset + 5] = 0x72; bytes[remOffset + 6] = 0x65; bytes[remOffset + 7] = 0x65; // 'free'
                for (let i = remOffset + 8; i < remOffset + remaining; i++) {
                  bytes[i] = 0;
                }
              }
              return bytes;
            }
          }
          mOffset += mSize;
        }
      }
      offset = boxEnd;
    }

    // 2. Search for a top-level 'free' box (e.g. from scrubbed UUID / udta outside moov)
    offset = 0;
    while (offset + 8 <= len) {
      let boxSize = view.getUint32(offset, false);
      const boxType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (boxSize === 0) boxSize = len - offset;
      if (boxSize < 8 || isNaN(boxSize)) break;
      const boxEnd = Math.min(len, offset + boxSize);

      if (boxType === 'free' && boxSize >= compactUdta.length) {
        const chosenUdta = (boxSize >= fullUdta.length) ? fullUdta : compactUdta;
        bytes.set(chosenUdta, offset);
        const remaining = boxSize - chosenUdta.length;
        if (remaining >= 8) {
          const remOffset = offset + chosenUdta.length;
          view.setUint32(remOffset, remaining, false);
          bytes[remOffset + 4] = 0x66; bytes[remOffset + 5] = 0x72; bytes[remOffset + 6] = 0x65; bytes[remOffset + 7] = 0x65;
          for (let i = remOffset + 8; i < remOffset + remaining; i++) {
            bytes[i] = 0;
          }
        }
        return bytes;
      }
      offset = boxEnd;
    }

    return bytes;
  }

  /**
   * Builds an ISOBMFF 'udta' atom with authentic QuickTime/Apple metadata items:
   * ©mak (Make), ©mod (Model), ©swr (Software), ©day (Creation Date)
   */
  static buildCameraUdtaAtom(profile, compact = false) {
    const encoder = new TextEncoder();
    const makeData = encoder.encode(profile.make);
    const modelData = encoder.encode(profile.model);

    const buildIlstItem = (fourCC, textBytes) => {
      const dataBoxLen = 12 + textBytes.length;
      const itemLen = 8 + dataBoxLen;
      const b = new Uint8Array(itemLen);
      const v = new DataView(b.buffer);

      v.setUint32(0, itemLen, false);
      b[4] = fourCC.charCodeAt(0); b[5] = fourCC.charCodeAt(1); b[6] = fourCC.charCodeAt(2); b[7] = fourCC.charCodeAt(3);
      v.setUint32(8, dataBoxLen, false);
      b[12] = 0x64; b[13] = 0x61; b[14] = 0x74; b[15] = 0x61; // 'data'
      v.setUint32(16, 1, false); // type 1 = utf-8
      b.set(textBytes, 20);
      return b;
    };

    const itemMak = buildIlstItem('©mak', makeData);
    const itemMod = buildIlstItem('©mod', modelData);

    let items = [itemMak, itemMod];
    if (!compact) {
      const softwareData = encoder.encode(profile.software);
      const now = new Date();
      const dateData = encoder.encode(now.toISOString());
      items.push(buildIlstItem('©swr', softwareData));
      items.push(buildIlstItem('©day', dateData));
    }

    const ilstPayloadLen = items.reduce((acc, it) => acc + it.length, 0);
    const ilstLen = 8 + ilstPayloadLen;
    const ilstBox = new Uint8Array(ilstLen);
    const vIlst = new DataView(ilstBox.buffer);
    vIlst.setUint32(0, ilstLen, false);
    ilstBox[4] = 0x69; ilstBox[5] = 0x6C; ilstBox[6] = 0x73; ilstBox[7] = 0x74; // 'ilst'

    let cur = 8;
    for (const it of items) {
      ilstBox.set(it, cur);
      cur += it.length;
    }

    // udta Box (size + 'udta' + ilst)
    const udtaLen = 8 + ilstLen;
    const udtaBox = new Uint8Array(udtaLen);
    const vUdta = new DataView(udtaBox.buffer);
    vUdta.setUint32(0, udtaLen, false);
    udtaBox[4] = 0x75; udtaBox[5] = 0x64; udtaBox[6] = 0x74; udtaBox[7] = 0x61; // 'udta'
    udtaBox.set(ilstBox, 8);

    return udtaBox;
  }

  /**
   * Standard IEEE 802.3 CRC32 calculation for PNG chunks
   */
  static calculateCRC32(bytes) {
    if (!this._crcTable) {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
      }
      this._crcTable = table;
    }

    let crc = 0xFFFFFFFF;
    const table = this._crcTable;
    for (let i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}
