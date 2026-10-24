/**
 * GhostMeta AI - Computer Vision AI Corner Watermark Remover
 * Automatically detects and seamlessly inpaints visible AI corner watermarks
 * (such as Google Gemini / Imagen 4-point sparkle, Veo, DALL·E, and AI video badges)
 * while keeping 99% of the rest of the frame pixel-for-pixel bit-identical.
 */

export class WatermarkRemover {
  /**
   * Remove corner watermark from an HTML5 Canvas context in-place.
   * Only modifies pixels strictly within the targeted corner ROI.
   * 
   * @param {CanvasRenderingContext2D} ctx 
   * @param {number} width 
   * @param {number} height 
   * @param {Object} options 
   * @returns {Object} Inspection & inpainting metrics (before & after thumbnails, pixel counts)
   */
  static removeCornerWatermark(ctx, width, height, options = {}) {
    const {
      corner = 'bottom-right', // 'bottom-right', 'bottom-left', 'top-right', 'custom'
      customROI = null,
      dilationRadius = 3,
      noiseMatching = true,
      sensitivity = 1.0,
      temporalContext = null // Optional temporal accumulator for video frame sequences
    } = options;

    // 1. Calculate Strict Region of Interest (ROI)
    const roi = this.getROI(width, height, corner, customROI);
    if (roi.w <= 4 || roi.h <= 4) {
      return { watermarkDetected: false, pixelsInpainted: 0, roi };
    }

    // Extract ONLY the corner ROI pixels (Leaving 99% of canvas untouched!)
    const cornerImageData = ctx.getImageData(roi.x, roi.y, roi.w, roi.h);
    const data = cornerImageData.data;
    const cw = roi.w;
    const ch = roi.h;

    // Snapshot pristine before state of corner for user verification
    const beforeThumbnail = this.createThumbnailFromData(cornerImageData, cw, ch);

    // 2. Adaptive Gemini Sparkle / Badge Mask Detection
    const { mask, count, hasWatermark } = this.detectWatermarkMask(data, cw, ch, sensitivity);

    // Apply Temporal Smoothing across video frames to eliminate any edge flicker
    let effectiveMask = mask;
    let effectiveCount = count;
    if (temporalContext) {
      if (!temporalContext.accumulated || temporalContext.accumulated.length !== mask.length) {
        temporalContext.accumulated = new Float32Array(mask.length);
        temporalContext.frames = 0;
      }
      temporalContext.frames++;
      const acc = temporalContext.accumulated;
      const alpha = 0.25;
      let smoothCount = 0;
      const smoothedMask = new Uint8Array(mask.length);
      for (let i = 0; i < mask.length; i++) {
        acc[i] = acc[i] * (1 - alpha) + mask[i] * alpha;
        if (acc[i] >= 0.20) {
          smoothedMask[i] = 1;
          smoothCount++;
        }
      }
      if (smoothCount >= 10 || hasWatermark) {
        effectiveMask = smoothedMask;
        effectiveCount = smoothCount;
      }
    }

    if ((!hasWatermark && effectiveCount < 10) || effectiveCount < 8) {
      // Zero false positives: if no authentic watermark signature is found, touch 0 pixels!
      return {
        watermarkDetected: false,
        pixelsInpainted: 0,
        roi,
        beforeThumbnail,
        afterThumbnail: beforeThumbnail
      };
    }

    // 3. Morphological Dilation (3px radius default)
    // Completely captures anti-aliasing edge halos and translucent boundary fringes
    const dilatedMask = this.dilateMask(effectiveMask, cw, ch, dilationRadius);

    // 4. Boundary-Guided Inpainting (Fast Marching / Directional Interpolation)
    this.inpaintBoundaryMarching(data, dilatedMask, cw, ch);

    // 5. Texture Micro-Grain Matching
    // Measures local background high-frequency noise variance and matches grain
    if (noiseMatching) {
      this.applyTextureGrain(data, dilatedMask, cw, ch);
    }

    // Write back ONLY to the isolated ROI bounding box
    ctx.putImageData(cornerImageData, roi.x, roi.y);

    const afterThumbnail = this.createThumbnailFromData(cornerImageData, cw, ch);

    return {
      watermarkDetected: true,
      pixelsInpainted: count,
      dilatedPixels: dilatedMask.filter(v => v === 1).length,
      roi,
      beforeThumbnail,
      afterThumbnail
    };
  }

  /**
   * Process raw ImageData directly (used for video frames and worker threads)
   */
  static processImageData(imageData, options = {}) {
    const width = imageData.width;
    const height = imageData.height;
    const {
      corner = 'bottom-right',
      customROI = null,
      dilationRadius = 3,
      noiseMatching = true,
      sensitivity = 1.0
    } = options;

    const roi = this.getROI(width, height, corner, customROI);
    const fullData = imageData.data;

    // Extract corner sub-buffer
    const cornerBuffer = new Uint8ClampedArray(roi.w * roi.h * 4);
    for (let y = 0; y < roi.h; y++) {
      const srcOffset = ((roi.y + y) * width + roi.x) * 4;
      const dstOffset = y * roi.w * 4;
      cornerBuffer.set(fullData.subarray(srcOffset, srcOffset + roi.w * 4), dstOffset);
    }

    const { mask, count, hasWatermark } = this.detectWatermarkMask(cornerBuffer, roi.w, roi.h, sensitivity);
    if (!hasWatermark || count < 10) {
      return { watermarkDetected: false, pixelsInpainted: 0, roi };
    }

    const dilatedMask = this.dilateMask(mask, roi.w, roi.h, dilationRadius);
    this.inpaintBoundaryMarching(cornerBuffer, dilatedMask, roi.w, roi.h);
    if (noiseMatching) {
      this.applyTextureGrain(cornerBuffer, dilatedMask, roi.w, roi.h);
    }

    // Write back strictly to corner pixels in fullData
    for (let y = 0; y < roi.h; y++) {
      const srcOffset = y * roi.w * 4;
      const dstOffset = ((roi.y + y) * width + roi.x) * 4;
      fullData.set(cornerBuffer.subarray(srcOffset, srcOffset + roi.w * 4), dstOffset);
    }

    return {
      watermarkDetected: true,
      pixelsInpainted: count,
      roi
    };
  }

  /**
   * Computes Region of Interest (ROI) box
   */
  static getROI(width, height, corner = 'bottom-right', customROI = null) {
    if (customROI && customROI.w && customROI.h) {
      const x = Math.max(0, Math.min(width - 2, Math.floor(customROI.x || 0)));
      const y = Math.max(0, Math.min(height - 2, Math.floor(customROI.y || 0)));
      const w = Math.min(width - x, Math.floor(customROI.w));
      const h = Math.min(height - y, Math.floor(customROI.h));
      return { x, y, w, h };
    }

    // Default: Gemini sparkle watermark is positioned at bottom-right corner (approx outer 14% of dimensions)
    const factor = 0.86;
    if (corner === 'bottom-left') {
      const w = Math.max(24, Math.floor(width * 0.15));
      const h = Math.max(24, Math.floor(height * 0.15));
      return { x: 0, y: height - h, w, h };
    } else if (corner === 'top-right') {
      const w = Math.max(24, Math.floor(width * 0.15));
      const h = Math.max(24, Math.floor(height * 0.15));
      return { x: width - w, y: 0, w, h };
    } else {
      // 'bottom-right' (Gemini, Imagen, Veo, DALL-E)
      const x = Math.floor(width * factor);
      const y = Math.floor(height * factor);
      const w = width - x;
      const h = height - y;
      return { x, y, w, h };
    }
  }

  /**
   * Adaptive Gemini Sparkle & Badge Mask Detection
   * Analyzes local background luminance, chroma neutrality, and gradient prominence.
   */
  static detectWatermarkMask(data, w, h, sensitivity = 1.0) {
    const totalPixels = w * h;
    const lum = new Float32Array(totalPixels);
    const sat = new Float32Array(totalPixels);
    const mask = new Uint8Array(totalPixels);

    // 1. Calculate luminance and chroma saturation for each pixel
    for (let i = 0, p = 0; i < totalPixels; i++, p += 4) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      sat[i] = max - min; // Color saturation / chroma disparity
    }

    // 2. Fast 2D local background luminance using separable box filter (radius 7, 15x15 window)
    const bgLum = this.boxBlur(lum, w, h, 7);

    let count = 0;
    const threshDelta = 16 / Math.max(0.5, sensitivity);
    const highLumThresh = 210;

    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const idx = y * w + x;
        const l = lum[idx];
        const s = sat[idx];
        const bg = bgLum[idx];
        const delta = l - bg;

        // Gemini sparkle watermark characteristics:
        // - Bright highlight (delta > threshold)
        // - Neutral white/translucent chroma (sat < 65)
        // - Or extremely bright specular star core (l > 210 with low saturation)
        const isBrightDeviation = delta > threshDelta && s < 70 && l > 120;
        const isSpecularCore = l > highLumThresh && s < 45 && delta > 8;

        if (isBrightDeviation || isSpecularCore) {
          mask[idx] = 1;
          count++;
        }
      }
    }

    // Check if detected pattern is an authentic watermark cluster or just uniform background
    const minPixels = Math.max(12, Math.floor(totalPixels * 0.0015));
    const maxPixels = Math.floor(totalPixels * 0.40); // Shouldn't take over whole corner

    const hasWatermark = count >= minPixels && count <= maxPixels;
    return { mask, count, hasWatermark };
  }

  /**
   * Morphological Dilation (expands mask outward by radius to swallow halo fringes)
   */
  static dilateMask(mask, w, h, radius = 3) {
    const dilated = new Uint8Array(mask.length);
    const rSq = radius * radius;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] === 1) {
          // Spread to neighbors within circle
          for (let dy = -radius; dy <= radius; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= w) continue;
              if (dx * dx + dy * dy <= rSq) {
                dilated[ny * w + nx] = 1;
              }
            }
          }
        }
      }
    }
    return dilated;
  }

  /**
   * Fast Marching Boundary Inpainting
   * Inpaints masked pixels from the clean outer perimeter inward.
   */
  static inpaintBoundaryMarching(data, mask, w, h) {
    const state = new Uint8Array(mask); // 1 = inpaint needed, 0 = known clean
    const total = w * h;

    // Identify initial boundary frontier
    let frontier = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (state[idx] === 1) {
          // Check if it borders a clean pixel
          if (
            (x > 0 && state[idx - 1] === 0) ||
            (x < w - 1 && state[idx + 1] === 0) ||
            (y > 0 && state[idx - w] === 0) ||
            (y < h - 1 && state[idx + w] === 0)
          ) {
            frontier.push(idx);
          }
        }
      }
    }

    // Inward Marching Loop
    const maxRadius = 7;
    let iteration = 0;
    const maxIterations = total;

    while (frontier.length > 0 && iteration < maxIterations) {
      iteration++;
      const nextFrontier = [];

      for (let i = 0; i < frontier.length; i++) {
        const idx = frontier[i];
        if (state[idx] === 0) continue;

        const x = idx % w;
        const y = Math.floor(idx / w);

        let totalWeight = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;

        // Sample known neighbors in local window
        for (let dy = -maxRadius; dy <= maxRadius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -maxRadius; dx <= maxRadius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const nIdx = ny * w + nx;
            if (state[nIdx] === 0) {
              const distSq = dx * dx + dy * dy;
              if (distSq > maxRadius * maxRadius) continue;
              const weight = 1.0 / (distSq + 0.1);

              const p = nIdx * 4;
              sumR += data[p] * weight;
              sumG += data[p + 1] * weight;
              sumB += data[p + 2] * weight;
              totalWeight += weight;
            }
          }
        }

        if (totalWeight > 0) {
          const p = idx * 4;
          data[p] = Math.round(sumR / totalWeight);
          data[p + 1] = Math.round(sumG / totalWeight);
          data[p + 2] = Math.round(sumB / totalWeight);
          // Preserve original alpha
          state[idx] = 0; // Marked as resolved

          // Add newly exposed masked neighbors to next frontier
          if (x > 0 && state[idx - 1] === 1) nextFrontier.push(idx - 1);
          if (x < w - 1 && state[idx + 1] === 1) nextFrontier.push(idx + 1);
          if (y > 0 && state[idx - w] === 1) nextFrontier.push(idx - w);
          if (y < h - 1 && state[idx + w] === 1) nextFrontier.push(idx + w);
        } else {
          nextFrontier.push(idx);
        }
      }

      // Deduplicate next frontier
      frontier = Array.from(new Set(nextFrontier));
    }
  }

  /**
   * Texture Micro-Grain Matching
   * Injects micro-grain matched to the clean background variance so the corner never looks smooth or plastic.
   */
  static applyTextureGrain(data, mask, w, h) {
    const total = w * h;
    let cleanCount = 0;
    let sumDiff = 0;
    let sumDiffSq = 0;

    // Estimate local background grain from clean unmasked pixels
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (mask[idx] === 0 && mask[idx + 1] === 0) {
          const p1 = idx * 4;
          const p2 = (idx + 1) * 4;
          const lum1 = 0.299 * data[p1] + 0.587 * data[p1 + 1] + 0.114 * data[p1 + 2];
          const lum2 = 0.299 * data[p2] + 0.587 * data[p2 + 1] + 0.114 * data[p2 + 2];
          const diff = lum1 - lum2;
          sumDiff += diff;
          sumDiffSq += diff * diff;
          cleanCount++;
        }
      }
    }

    if (cleanCount < 20) return;

    const variance = (sumDiffSq / cleanCount) - Math.pow(sumDiff / cleanCount, 2);
    const stdDev = Math.sqrt(Math.max(0, variance));

    // If there is natural grain in the image, synthesize matching subtle grain
    const grainStrength = Math.min(6.0, Math.max(0.5, stdDev * 0.7));

    for (let i = 0; i < total; i++) {
      if (mask[i] === 1) {
        const p = i * 4;
        const noise = (Math.random() - 0.5) * 2 * grainStrength;
        data[p] = Math.min(255, Math.max(0, Math.round(data[p] + noise)));
        data[p + 1] = Math.min(255, Math.max(0, Math.round(data[p + 1] + noise)));
        data[p + 2] = Math.min(255, Math.max(0, Math.round(data[p + 2] + noise)));
      }
    }
  }

  /**
   * Fast Separable 2D Box Blur
   */
  static boxBlur(input, w, h, radius) {
    const temp = new Float32Array(w * h);
    const output = new Float32Array(w * h);

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      let sum = 0;
      let count = 0;
      for (let x = -radius; x <= radius; x++) {
        if (x >= 0 && x < w) {
          sum += input[y * w + x];
          count++;
        }
      }
      for (let x = 0; x < w; x++) {
        temp[y * w + x] = sum / count;
        const removeX = x - radius;
        const addX = x + radius + 1;
        if (removeX >= 0) {
          sum -= input[y * w + removeX];
          count--;
        }
        if (addX < w) {
          sum += input[y * w + addX];
          count++;
        }
      }
    }

    // Vertical pass
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let y = -radius; y <= radius; y++) {
        if (y >= 0 && y < h) {
          sum += temp[y * w + x];
          count++;
        }
      }
      for (let y = 0; y < h; y++) {
        output[y * w + x] = sum / count;
        const removeY = y - radius;
        const addY = y + radius + 1;
        if (removeY >= 0) {
          sum -= temp[removeY * w + x];
          count--;
        }
        if (addY < h) {
          sum += temp[addY * w + x];
          count++;
        }
      }
    }

    return output;
  }

  /**
   * Creates an in-memory base64 thumbnail of an ImageData buffer
   */
  static createThumbnailFromData(imageData, w, h) {
    if (typeof document === 'undefined') return '';
    try {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.putImageData(imageData, 0, 0);
      return c.toDataURL('image/png');
    } catch {
      return '';
    }
  }
}
