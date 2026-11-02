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

  /**
   * Inspects MP4/MOV container to verify whether it contains any audio track ('soun')
   * @param {ArrayBuffer|Uint8Array} buffer 
   * @returns {boolean} True if an audio track exists, false if video-only
   */
  static hasAudioTrack(buffer) {
    if (!buffer) return false;
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = bytes.length;

    let foundAudio = false;

    function walk(start, end) {
      let cur = start;
      while (cur + 8 <= end && !foundAudio) {
        let boxSize = view.getUint32(cur, false);
        let headerSize = 8;
        if (boxSize === 0) boxSize = end - cur;
        else if (boxSize === 1) {
          if (cur + 16 > end) break;
          const high = view.getUint32(cur + 8, false);
          const low = view.getUint32(cur + 12, false);
          boxSize = high * 4294967296 + low;
          headerSize = 16;
        }
        if (boxSize < headerSize || cur + boxSize > end || isNaN(boxSize)) break;

        const boxType = String.fromCharCode(
          bytes[cur + 4], bytes[cur + 5], bytes[cur + 6], bytes[cur + 7]
        );

        if (boxType === 'hdlr') {
          if (cur + 20 <= cur + boxSize) {
            const handler = String.fromCharCode(
              bytes[cur + 16], bytes[cur + 17], bytes[cur + 18], bytes[cur + 19]
            );
            if (handler === 'soun') {
              foundAudio = true;
              return;
            }
          }
        }

        const containerBoxes = ['moov', 'trak', 'mdia', 'minf'];
        if (containerBoxes.includes(boxType)) {
          walk(cur + headerSize, cur + boxSize);
        }

        cur += boxSize;
      }
    }

    walk(0, len);
    return foundAudio;
  }

  /**
   * Patches duration in MP4/MOV containers (mvhd, tkhd, mdhd, mehd)
   * Resolves the "00:00:00 duration" bug on Instagram, QuickTime, iOS, Android, and video editors
   * 
   * @param {ArrayBuffer|Uint8Array} buffer 
   * @param {number} targetDurationInSeconds
   * @returns {Uint8Array}
   */
  static patchDuration(buffer, targetDurationInSeconds) {
    if (!targetDurationInSeconds || targetDurationInSeconds <= 0 || !Number.isFinite(targetDurationInSeconds)) {
      return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    }

    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = bytes.length;

    let movieTimescale = 1000;

    function walk(start, end) {
      let cur = start;
      while (cur + 8 <= end) {
        let boxSize = view.getUint32(cur, false);
        let headerSize = 8;

        if (boxSize === 0) {
          boxSize = end - cur;
        } else if (boxSize === 1) {
          if (cur + 16 > end) break;
          const high = view.getUint32(cur + 8, false);
          const low = view.getUint32(cur + 12, false);
          boxSize = high * 4294967296 + low;
          headerSize = 16;
        }

        if (boxSize < headerSize || cur + boxSize > end || isNaN(boxSize)) break;

        const boxType = String.fromCharCode(
          bytes[cur + 4], bytes[cur + 5], bytes[cur + 6], bytes[cur + 7]
        );

        if (boxType === 'mvhd') {
          const v = bytes[cur + 8];
          movieTimescale = v === 0 ? view.getUint32(cur + 20, false) : view.getUint32(cur + 28, false);
          if (!movieTimescale || isNaN(movieTimescale)) movieTimescale = 1000;

          const movieDur = Math.round(targetDurationInSeconds * movieTimescale);
          if (v === 0) {
            view.setUint32(cur + 24, movieDur, false);
          } else {
            view.setUint32(cur + 32, 0, false);
            view.setUint32(cur + 36, movieDur, false);
          }
        } else if (boxType === 'tkhd') {
          const v = bytes[cur + 8];
          // Track duration in tkhd is in movieTimescale units!
          const trackDur = Math.round(targetDurationInSeconds * movieTimescale);
          if (v === 0) {
            view.setUint32(cur + 28, trackDur, false);
          } else {
            view.setUint32(cur + 32, 0, false);
            view.setUint32(cur + 36, trackDur, false);
          }
        } else if (boxType === 'mdhd') {
          const v = bytes[cur + 8];
          const mediaTimescale = v === 0 ? view.getUint32(cur + 20, false) : view.getUint32(cur + 28, false);
          const ts = (mediaTimescale && !isNaN(mediaTimescale)) ? mediaTimescale : movieTimescale;
          // Media duration in mdhd is in mediaTimescale units!
          const mediaDur = Math.round(targetDurationInSeconds * ts);
          if (v === 0) {
            view.setUint32(cur + 24, mediaDur, false);
          } else {
            view.setUint32(cur + 32, 0, false);
            view.setUint32(cur + 36, mediaDur, false);
          }
        } else if (boxType === 'mehd') {
          // Movie Extends Header in fragmented MP4 mvex box
          const v = bytes[cur + 8];
          const fragDur = Math.round(targetDurationInSeconds * movieTimescale);
          if (v === 0) {
            view.setUint32(cur + 12, fragDur, false);
          } else {
            view.setUint32(cur + 12, 0, false);
            view.setUint32(cur + 16, fragDur, false);
          }
        }

        const containerBoxes = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex'];
        if (containerBoxes.includes(boxType)) {
          walk(cur + headerSize, cur + boxSize);
        }

        cur += boxSize;
      }
    }

    walk(0, len);
    return bytes;
  }
}
