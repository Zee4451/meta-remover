/**
 * GhostMeta AI - WebM EBML Metadata & Duration Patcher
 * Injects/patches EBML Duration (0x4489) inside Segment.Info
 * Resolves the "00:00:00 duration" / unseekable bug in WebM video players
 */

export class WebMCleaner {
  /**
   * Read EBML Variable-Length Integer (VINT)
   * @param {Uint8Array} bytes 
   * @param {number} offset 
   * @returns {{length: number, value: number}}
   */
  static readVint(bytes, offset) {
    const firstByte = bytes[offset];
    if (firstByte === undefined) return { length: 0, value: 0 };
    let mask = 0x80;
    let length = 1;
    while ((firstByte & mask) === 0 && length <= 8) {
      mask >>= 1;
      length++;
    }
    if (length > 8) return { length: 0, value: 0 };
    let value = firstByte & (mask - 1);
    for (let i = 1; i < length; i++) {
      value = (value * 256) + bytes[offset + i];
    }
    return { length, value };
  }

  /**
   * Patches EBML Duration (0x4489) inside Segment Info
   * @param {ArrayBuffer|Uint8Array} buffer 
   * @param {number} targetDurationInSeconds 
   * @returns {Uint8Array} Patched WebM buffer
   */
  static patchDuration(buffer, targetDurationInSeconds) {
    if (!targetDurationInSeconds || targetDurationInSeconds <= 0 || !Number.isFinite(targetDurationInSeconds)) {
      return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    }

    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const len = bytes.length;

    // Search for Info element ID [0x15, 0x49, 0xA9, 0x66]
    let infoOffset = -1;
    for (let i = 0; i < Math.min(len - 4, 4096); i++) {
      if (bytes[i] === 0x15 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0xA9 && bytes[i + 3] === 0x66) {
        infoOffset = i;
        break;
      }
    }

    if (infoOffset === -1) return bytes;

    const infoVint = this.readVint(bytes, infoOffset + 4);
    if (infoVint.length === 0) return bytes;

    const infoStart = infoOffset + 4 + infoVint.length;
    const infoEnd = infoStart + infoVint.value;

    let timecodeScale = 1000000; // default 1ms = 1,000,000ns
    let durationOffset = -1;
    let durationSize = -1;

    let cur = infoStart;
    while (cur < infoEnd && cur < len) {
      // Check TimecodeScale [0x2A, 0xD7, 0xB1]
      if (bytes[cur] === 0x2A && bytes[cur + 1] === 0xD7 && bytes[cur + 2] === 0xB1) {
        const v = this.readVint(bytes, cur + 3);
        const valOffset = cur + 3 + v.length;
        let ts = 0;
        for (let j = 0; j < v.value; j++) ts = (ts * 256) + bytes[valOffset + j];
        if (ts > 0) timecodeScale = ts;
        cur = valOffset + v.value;
        continue;
      }

      // Check Duration [0x44, 0x89]
      if (bytes[cur] === 0x44 && bytes[cur + 1] === 0x89) {
        const v = this.readVint(bytes, cur + 2);
        durationOffset = cur + 2 + v.length;
        durationSize = v.value;
        break;
      }

      // Skip generic element
      const idVint = this.readVint(bytes, cur);
      if (idVint.length === 0) break;
      const szVint = this.readVint(bytes, cur + idVint.length);
      if (szVint.length === 0) break;
      cur += idVint.length + szVint.length + szVint.value;
    }

    const durationMs = targetDurationInSeconds * (1e9 / timecodeScale);

    if (durationOffset !== -1) {
      // Modify existing duration element in place
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (durationSize === 4) {
        view.setFloat32(durationOffset, durationMs, false);
      } else if (durationSize === 8) {
        view.setFloat64(durationOffset, durationMs, false);
      }
      return bytes;
    }

    // Duration element does not exist yet: inject [0x44, 0x89, 0x88, float64] into Info
    const durationElem = new Uint8Array(11);
    durationElem[0] = 0x44;
    durationElem[1] = 0x89;
    durationElem[2] = 0x88; // 1-byte vint for length 8
    const elemView = new DataView(durationElem.buffer);
    elemView.setFloat64(3, durationMs, false);

    const newBytes = new Uint8Array(len + 11);
    newBytes.set(bytes.subarray(0, infoOffset + 4), 0);

    const newInfoLen = infoVint.value + 11;
    if (infoVint.length === 1 && newInfoLen <= 126) {
      newBytes[infoOffset + 4] = 0x80 | newInfoLen;
      newBytes.set(durationElem, infoStart);
      newBytes.set(bytes.subarray(infoStart), infoStart + 11);
      return newBytes;
    }

    return bytes;
  }
}
