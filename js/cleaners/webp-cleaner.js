/**
 * GhostMeta AI - WebP Lossless Metadata Stripper
 * Cleans EXIF, XMP, and JUMB (C2PA) chunks from WebP images,
 * and updates the VP8X header flags to reflect the stripped metadata.
 */

export class WebPCleaner {
  /**
   * Clean WebP binary ArrayBuffer
   * @param {ArrayBuffer} buffer 
   * @returns {Uint8Array} Cleaned WebP buffer
   */
  static clean(buffer) {
    let bytes;
    if (buffer instanceof Uint8Array) {
      bytes = buffer;
    } else if (buffer && buffer.buffer) {
      bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      bytes = new Uint8Array(buffer);
    }
    const len = bytes.length;

    if (len < 12) {
      throw new Error('Invalid WebP file: Too short.');
    }

    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new Error('Invalid WebP header: RIFF/WEBP not found.');
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks = [];
    let offset = 12;
    const dropChunks = new Set(['EXIF', 'XMP ', 'JUMB', 'c2pa']);

    while (offset + 8 <= len) {
      const fourCC = String.fromCharCode(...bytes.slice(offset, offset + 4));
      const chunkSize = view.getUint32(offset + 4, true); // Little-endian unsigned 32-bit uint

      const chunkTotalSize = 8 + chunkSize + (chunkSize % 2); // 2-byte alignment padding
      const chunkEnd = offset + chunkTotalSize;

      if (offset + 8 + chunkSize > len) {
        break;
      }

      if (fourCC === 'VP8X') {
        // Copy chunk and clear EXIF (bit 3: 0x08) and XMP (bit 2: 0x04) flags
        const vp8xChunk = bytes.slice(offset, Math.min(chunkEnd, len));
        if (vp8xChunk.length >= 9) {
          // vp8xChunk[8] is the 1-byte flags field in VP8X chunk payload
          // Bit 3 (0x08) = EXIF, Bit 2 (0x04) = XMP
          vp8xChunk[8] = vp8xChunk[8] & ~0x0C;
        }
        chunks.push(vp8xChunk);
      } else if (!dropChunks.has(fourCC)) {
        chunks.push(bytes.slice(offset, Math.min(chunkEnd, len)));
      }

      offset = chunkEnd;
    }

    // Calculate new total size
    const payloadLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const totalFileSize = 12 + payloadLength;
    const result = new Uint8Array(totalFileSize);

    // Write RIFF header
    result.set(bytes.slice(0, 4), 0); // 'RIFF'
    const riffSize = totalFileSize - 8;
    result[4] = riffSize & 0xFF;
    result[5] = (riffSize >>> 8) & 0xFF;
    result[6] = (riffSize >>> 16) & 0xFF;
    result[7] = (riffSize >>> 24) & 0xFF;
    result.set(bytes.slice(8, 12), 8); // 'WEBP'

    // Write preserved chunks
    let cur = 12;
    for (const chunk of chunks) {
      result.set(chunk, cur);
      cur += chunk.length;
    }

    return result;
  }
}
