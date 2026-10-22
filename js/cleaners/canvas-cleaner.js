/**
 * GhostMeta AI - Deep Canvas Scrub & Anti-SynthID Sanitizer
 * Re-renders image onto a pure Canvas pixel buffer, stripping 100% of non-pixel data,
 * with optional microscopic frequency dither to neutralize invisible watermarks (SynthID).
 */

export class CanvasCleaner {
  /**
   * Re-encode image through Canvas with optional anti-watermarking dither
   * @param {File|Blob} file 
   * @param {Object} options 
   * @returns {Promise<Blob>} Cleaned image Blob
   */
  static async clean(file, options = {}) {
    const {
      format = 'image/png', // 'image/png', 'image/jpeg', 'image/webp'
      quality = 0.98,
      antiSynthID = true
    } = options;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            throw new Error('Canvas 2D context unavailable.');
          }

          // Draw pristine image onto canvas
          ctx.drawImage(img, 0, 0, width, height);

          // Apply Anti-SynthID / Anti-Watermark micro-dither if requested
          if (antiSynthID) {
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;
            const len = data.length;

            // Microscopic 1-bit pseudo-random perturbation
            // Breaks frequency domain correlation without perceptible visual impact
            for (let i = 0; i < len; i += 4) {
              // Apply +-1 to RGB channels probabilistically
              const noiseR = (Math.random() > 0.5 ? 1 : -1) * (Math.random() < 0.25 ? 1 : 0);
              const noiseG = (Math.random() > 0.5 ? 1 : -1) * (Math.random() < 0.25 ? 1 : 0);
              const noiseB = (Math.random() > 0.5 ? 1 : -1) * (Math.random() < 0.25 ? 1 : 0);

              data[i] = Math.min(255, Math.max(0, data[i] + noiseR));
              data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noiseG));
              data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noiseB));
              // Leave Alpha untouched
            }

            ctx.putImageData(imgData, 0, 0);
          }

          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas toBlob conversion failed.'));
            }
          }, format, quality);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image into Canvas.'));
      };

      img.src = url;
    });
  }
}
