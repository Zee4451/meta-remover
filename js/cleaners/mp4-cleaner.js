/**
 * GhostMeta AI - MP4 / MOV Video Metadata & C2PA Stripper
 * Cleans C2PA UUID boxes, User Data (udta), and metadata tags from MP4/MOV containers
 * instantly without re-encoding or corrupting chunk offsets.
 * 
 * Uses DataView to handle both 32-bit and 64-bit box sizes safely without signed overflow.
 */

export class MP4Cleaner {
  /**
   * Clean MP4/MOV binary ArrayBuffer
   * @param {ArrayBuffer} buffer 
   * @returns {Uint8Array} Cleaned MP4 buffer
   */
  static clean(buffer) {
    // Clone buffer so we can modify in-place safely
    let bytes;
    if (buffer instanceof Uint8Array) {
      bytes = new Uint8Array(buffer.slice(0));
    } else if (buffer && buffer.buffer) {
      bytes = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    } else {
      bytes = new Uint8Array(buffer.slice(0));
    }
    const len = bytes.length;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let offset = 0;

    while (offset + 8 <= len) {
      let boxSize = view.getUint32(offset, false);
      let headerSize = 8;

      const boxType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      );

      if (boxSize === 0) {
        // Box extends to end of file
        boxSize = len - offset;
      } else if (boxSize === 1) {
        // 64-bit extended box size
        if (offset + 16 > len) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        boxSize = high * 4294967296 + low;
        headerSize = 16;
      }

      if (boxSize < headerSize || isNaN(boxSize)) break;
      const boxEnd = Math.min(len, offset + boxSize);

      // 1. Top-level UUID boxes (C2PA manifests & proprietary AI trackers)
      if (boxType === 'uuid') {
        this.turnBoxIntoFree(bytes, offset, boxSize, headerSize);
      }

      // 2. Movie Header box: scan for nested udta, meta, and track metadata
      if (boxType === 'moov') {
        this.cleanMoovBox(bytes, view, offset + headerSize, boxEnd);
      }

      // 3. User Data at top level (some encoders place udta outside moov)
      if (boxType === 'udta' || boxType === 'meta') {
        this.turnBoxIntoFree(bytes, offset, boxSize, headerSize);
      }

      offset = boxEnd;
    }

    return bytes;
  }

  /**
   * Scan inside moov box to clean udta and metadata atoms
   */
  static cleanMoovBox(bytes, view, start, end) {
    let offset = start;

    while (offset + 8 <= end) {
      let boxSize = view.getUint32(offset, false);
      let headerSize = 8;

      if (boxSize === 0) {
        boxSize = end - offset;
      } else if (boxSize === 1) {
        if (offset + 16 > end) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        boxSize = high * 4294967296 + low;
        headerSize = 16;
      }

      if (boxSize < headerSize || offset + boxSize > end || isNaN(boxSize)) {
        break;
      }

      const boxType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      );

      // 'udta' = User Data (contains AI prompts, vendor comments, GPS, creation notes)
      if (boxType === 'udta') {
        this.turnBoxIntoFree(bytes, offset, boxSize, headerSize);
      }
      // 'meta' at moov level contains QuickTime ilst or C2PA manifest boxes
      else if (boxType === 'meta') {
        this.turnBoxIntoFree(bytes, offset, boxSize, headerSize);
      }
      // Check inside tracks (trak) for any track-level udta or user metadata
      else if (boxType === 'trak') {
        this.cleanTrakBox(bytes, view, offset + headerSize, offset + boxSize);
      }

      offset += boxSize;
    }
  }

  /**
   * Clean track-level User Data
   */
  static cleanTrakBox(bytes, view, start, end) {
    let offset = start;
    while (offset + 8 <= end) {
      let boxSize = view.getUint32(offset, false);
      let headerSize = 8;

      if (boxSize === 0) {
        boxSize = end - offset;
      } else if (boxSize === 1) {
        if (offset + 16 > end) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        boxSize = high * 4294967296 + low;
        headerSize = 16;
      }

      if (boxSize < headerSize || offset + boxSize > end || isNaN(boxSize)) break;

      const boxType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      );

      if (boxType === 'udta' || boxType === 'meta') {
        this.turnBoxIntoFree(bytes, offset, boxSize, headerSize);
      }

      offset += boxSize;
    }
  }

  /**
   * Transforms a box into a standard ISOBMFF 'free' box
   * Keeping size identical preserves all media chunk offsets in stco/co64!
   */
  static turnBoxIntoFree(bytes, offset, size, headerSize = 8) {
    // Keep size intact in the first 4 bytes
    // Change 4-character type to 'free' (0x66, 0x72, 0x65, 0x65)
    bytes[offset + 4] = 0x66; // 'f'
    bytes[offset + 5] = 0x72; // 'r'
    bytes[offset + 6] = 0x65; // 'e'
    bytes[offset + 7] = 0x65; // 'e'

    // Zero-fill payload to destroy any AI tags, prompts, or signatures
    const payloadStart = offset + headerSize;
    const payloadEnd = Math.min(bytes.length, offset + size);
    for (let i = payloadStart; i < payloadEnd; i++) {
      bytes[i] = 0;
    }
  }
}
