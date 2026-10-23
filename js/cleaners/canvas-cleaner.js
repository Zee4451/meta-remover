/**
 * GhostMeta AI - Deep Canvas Scrub & Anti-SynthID Sanitizer
 * Re-renders image onto a pure Canvas pixel buffer at exact native resolution,
 * with optional microscopic frequency dither (PSNR > 58 dB) and visible AI watermark removal.
 */

import { WatermarkRemover } from './watermark-remover.js';

export class CanvasCleaner {
  /**
   * Re-encode image through Canvas with optional anti-watermarking dither & corner watermark removal
   * @param {File|Blob} file 
   * @param {Object} options 
   * @returns {Promise<Object>} { blob, watermarkMetrics }
   */
  static async clean(file, options = {}) {
    const {
      format = 'image/png', // 'image/png', 'image/jpeg', 'image/webp'
      quality = 1.0, // Guaranteed 100% maximum encoding quality
      antiSynthID = true,
      removeWatermark = false,
      corner = 'bottom-right',
      customROI = null
    } = options;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        try {
          // Exact native dimensions to guarantee zero sub-pixel blurring
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          // sRGB colorSpace & un-smoothed pristine rendering
          const ctx = canvas.getContext('2d', {
            willReadFrequently: true,
            colorSpace: 'srgb'
          });
          if (!ctx) {
            throw new Error('Canvas 2D context unavailable.');
          }
          ctx.imageSmoothingEnabled = false;

          // If output format is JPEG, composite over white background (JPEG has no alpha channel)
          // For PNG and WebP, preserve 100% alpha transparency
          if (format === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
          } else {
            ctx.clearRect(0, 0, width, height);
          }

          // Draw pristine image onto canvas at exact 1:1 pixel coordinates
          ctx.drawImage(img, 0, 0, width, height);

          // 1. Visible AI Corner Watermark Inpainting (if enabled)
          let watermarkMetrics = null;
          if (removeWatermark) {
            watermarkMetrics = WatermarkRemover.removeCornerWatermark(ctx, width, height, {
              corner,
              customROI,
              noiseMatching: true,
              sensitivity: options.watermarkSensitivity || 1.0
            });
          }

          // 2. Anti-SynthID Micro-Frequency Jitter (if enabled)
          // Clamped to +-1 LSB on a sparse 5% pixel subset to guarantee PSNR > 58 dB (100% visually imperceptible)
          if (antiSynthID) {
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;
            const len = data.length;

            for (let i = 0; i < len; i += 4) {
              // Skip transparent pixels
              if (data[i + 3] === 0) continue;

              // Sparse 5% subset to guarantee zero visual degradation
              if (Math.random() < 0.05) {
                const noiseR = Math.random() > 0.5 ? 1 : -1;
                const noiseG = Math.random() > 0.5 ? 1 : -1;
                const noiseB = Math.random() > 0.5 ? 1 : -1;

                data[i] = Math.min(255, Math.max(0, data[i] + noiseR));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noiseG));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noiseB));
              }
            }

            ctx.putImageData(imgData, 0, 0);
          }

          // Maximum quality export (quality: 1.0 for JPEG/WebP, lossless for PNG)
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (blob) {
              resolve({
                blob,
                watermarkMetrics
              });
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
