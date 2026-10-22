/**
 * GhostMeta AI - JPEG Lossless Metadata Stripper
 * Cleans EXIF (APP1), XMP (APP1), C2PA JUMBF (APP2/APP11), IPTC (APP13), and Comments (COM)
 * without re-encoding or losing single bit of image quality.
 */

export class JPEGCleaner {
  /**
   * Clean JPEG binary ArrayBuffer
   * @param {ArrayBuffer} buffer 
   * @param {Object} options 
   * @returns {Uint8Array} Cleaned JPEG buffer
   */
  static clean(buffer, options = { keepICC: true }) {
    const bytes = new Uint8Array(buffer);
    const len = bytes.length;

    // Check SOI marker (0xFF, 0xD8)
    if (len < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      throw new Error('Invalid JPEG signature: Start of Image (0xFFD8) not found.');
    }

    const chunks = [];
    chunks.push(new Uint8Array([0xFF, 0xD8])); // Keep SOI

    let offset = 2;
    let foundSOS = false;

    while (offset < len) {
      if (bytes[offset] !== 0xFF) {
        // Alignment error or trailing data
        break;
      }

      // Handle byte stuffing or consecutive 0xFFs
      while (bytes[offset] === 0xFF && offset < len) {
        offset++;
      }
      if (offset >= len) break;

      const marker = bytes[offset];
      offset++;

      // Standalone markers
      if (marker === 0xD9) { // EOI (End of Image)
        chunks.push(new Uint8Array([0xFF, 0xD9]));
        break;
      }
      if (marker >= 0xD0 && marker <= 0xD7) { // RST markers
        chunks.push(new Uint8Array([0xFF, marker]));
        continue;
      }
      if (marker === 0x00) {
        continue;
      }

      if (offset + 2 > len) break;
      const markerLen = (bytes[offset] << 8) | bytes[offset + 1];
      const chunkStart = offset - 2; // includes 0xFF and marker
      const chunkEnd = offset + markerLen; // includes length bytes and payload

      if (chunkEnd > len) break;

      let keepChunk = true;

      // APP1: EXIF (0xE1) or XMP
      if (marker === 0xE1) {
        keepChunk = false; // Strip EXIF & XMP
      }
      // APP2: ICC Profile or C2PA JUMBF
      else if (marker === 0xE2) {
        const payload = bytes.slice(offset + 2, Math.min(offset + 2 + 14, chunkEnd));
        const str = new TextDecoder().decode(payload);
        if (str.startsWith('ICC_PROFILE')) {
          keepChunk = options.keepICC ?? true; // Optionally keep color profile
        } else {
          keepChunk = false; // Strip C2PA JUMBF
        }
      }
      // APP11: JPEG-XT / C2PA JUMBF Manifests
      else if (marker === 0xEB) {
        keepChunk = false;
      }
      // APP13: Photoshop IRB / IPTC (trainedAlgorithmicMedia)
      else if (marker === 0xED) {
        keepChunk = false;
      }
      // COM: Comments (Prompts, Model info)
      else if (marker === 0xFE) {
        keepChunk = false;
      }
      // APP0 (JFIF), APP14 (Adobe DCT), DQT (0xDB), DHT (0xC4), SOF (0xC0, 0xC2...), DRI (0xDD) -> KEEP!
      
      if (marker === 0xDA) {
        // Start of Scan: compressed pixel data follows!
        // We must keep SOS and EVERYTHING until EOI
        foundSOS = true;
        chunks.push(bytes.slice(chunkStart, len));
        break;
      }

      if (keepChunk) {
        chunks.push(bytes.slice(chunkStart, chunkEnd));
      }

      offset = chunkEnd;
    }

    if (!foundSOS) {
      // Fallback if SOS was not cleanly traversed
      return bytes;
    }

    // Combine all chunks into clean buffer
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
