/**
 * GhostMeta AI - PNG Lossless Metadata Stripper
 * Removes all text chunks (tEXt, zTXt, iTXt), EXIF (eXIf), and C2PA manifests (caPt, c2pa)
 * while keeping all image data (IHDR, PLTE, IDAT, IEND, tRNS, sRGB/iCCP).
 */

export class PNGCleaner {
  /**
   * Clean PNG binary ArrayBuffer
   * @param {ArrayBuffer} buffer 
   * @param {Object} options 
   * @returns {Uint8Array} Cleaned PNG buffer
   */
  static clean(buffer, options = { keepICC: true }) {
    const bytes = new Uint8Array(buffer);
    const len = bytes.length;

    // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (len < 8 ||
        bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47 ||
        bytes[4] !== 0x0D || bytes[5] !== 0x0A || bytes[6] !== 0x1A || bytes[7] !== 0x0A) {
      throw new Error('Invalid PNG signature.');
    }

    const chunks = [];
    chunks.push(bytes.slice(0, 8)); // 8-byte signature

    let offset = 8;
    const strippedChunksToDrop = new Set([
      'tEXt', 'zTXt', 'iTXt', 'eXIf', 'caPt', 'c2pa', 'jumb', 'dSIG'
    ]);

    while (offset + 12 <= len) {
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const chunkTotalLen = 4 + 4 + length + 4; // length + type + data + crc
      const chunkEnd = offset + chunkTotalLen;

      if (chunkEnd > len) {
        // Truncated chunk or malformed PNG
        break;
      }

      let keep = true;
      if (strippedChunksToDrop.has(type)) {
        keep = false;
      } else if (type === 'iCCP' && options.keepICC === false) {
        keep = false;
      }

      if (keep) {
        chunks.push(bytes.slice(offset, chunkEnd));
      }

      offset = chunkEnd;
      if (type === 'IEND') break;
    }

    // Combine all preserved chunks
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let cur = 0;
    for (const chunk of chunks) {
      result.set(chunk, cur);
      cur += chunk.length;
    }

    return result;
  }
}
