/**
 * GhostMeta AI - Computer Vision AI Corner Watermark Remover
 * Automatically detects and seamlessly inpaints visible AI corner watermarks
 * (such as Google Gemini / Imagen 4-point sparkle, Veo, DALL·E, and AI video badges)
 * while keeping 99% of the rest of the frame pixel-for-pixel bit-identical.
 */

import { healSelectedBoxes, WatermarkBoxSelector } from './watermark-box-selector.js';

export { healSelectedBoxes, WatermarkBoxSelector };

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
      customBoxes = null,
      currentTime = 0,
      dilationRadius = 4,
      noiseMatching = true,
      sensitivity = 1.0,
      temporalContext = null // Optional temporal accumulator for video frame sequences
    } = options;

    // 1. Multi-Box Interactive ROI Mode (User drawn boxes, corner presets & moving trackers)
    if (customBoxes && customBoxes.length > 0) {
      const activeBoxes = customBoxes.filter(b => currentTime >= (b.startTime ?? 0) && currentTime <= (b.endTime ?? Infinity));
      const targetBox = activeBoxes[0] || customBoxes[0];
      const bx = Math.max(0, Math.round(targetBox.x * width));
      const by = Math.max(0, Math.round(targetBox.y * height));
      const bw = Math.max(16, Math.min(width - bx, Math.round(targetBox.w * width)));
      const bh = Math.max(16, Math.min(height - by, Math.round(targetBox.h * height)));

      const beforeImgData = ctx.getImageData(bx, by, bw, bh);
      const beforeThumbnail = this.createThumbnailFromData(beforeImgData, bw, bh);
      const beforeDataCopy = new Uint8ClampedArray(beforeImgData.data);
      const pixelsHealed = healSelectedBoxes(ctx, width, height, customBoxes, currentTime);
      const afterImgData = ctx.getImageData(bx, by, bw, bh);
      const afterThumbnail = this.createThumbnailFromData(afterImgData, bw, bh);

      let totalDiff = 0;
      const numPixels = bw * bh;
      for (let i = 0; i < beforeDataCopy.length; i += 4) {
        const dr = Math.abs(beforeDataCopy[i] - afterImgData.data[i]);
        const dg = Math.abs(beforeDataCopy[i + 1] - afterImgData.data[i + 1]);
        const db = Math.abs(beforeDataCopy[i + 2] - afterImgData.data[i + 2]);
        totalDiff += (dr + dg + db) / 3;
      }
      const meanPixelDiff = numPixels > 0 ? (totalDiff / numPixels) : 0;

      return {
        watermarkDetected: true,
        pixelsInpainted: pixelsHealed,
        pixelDiff: meanPixelDiff,
        boxesInpainted: customBoxes.length,
        customBoxes,
        roi: { x: bx, y: by, w: bw, h: bh },
        beforeThumbnail,
        afterThumbnail
      };
    }

    // 2. Default Automated Gemini Sparkle Detection in Corner ROI
    const roi = this.getROI(width, height, corner, customROI);
    if (roi.w <= 4 || roi.h <= 4) {
      return { watermarkDetected: false, pixelsInpainted: 0, pixelDiff: 0, roi };
    }

    // Extract ONLY the corner ROI pixels (Leaving 99% of canvas untouched!)
    const cornerImageData = ctx.getImageData(roi.x, roi.y, roi.w, roi.h);
    const data = cornerImageData.data;
    const beforeDataCopy = new Uint8ClampedArray(data);
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

    if ((!hasWatermark && effectiveCount < 8) || effectiveCount < 6) {
      // Zero false positives: if no authentic watermark signature is found, touch 0 pixels!
      return {
        watermarkDetected: false,
        pixelsInpainted: 0,
        pixelDiff: 0,
        roi,
        beforeThumbnail,
        afterThumbnail: beforeThumbnail
      };
    }

    // 3. Morphological Dilation (4px radius default)
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

    let totalDiff = 0;
    const numPixels = cw * ch;
    for (let i = 0; i < beforeDataCopy.length; i += 4) {
      const dr = Math.abs(beforeDataCopy[i] - cornerImageData.data[i]);
      const dg = Math.abs(beforeDataCopy[i + 1] - cornerImageData.data[i + 1]);
      const db = Math.abs(beforeDataCopy[i + 2] - cornerImageData.data[i + 2]);
      totalDiff += (dr + dg + db) / 3;
    }
    const meanPixelDiff = numPixels > 0 ? (totalDiff / numPixels) : 0;

    return {
      watermarkDetected: true,
      pixelsInpainted: count,
      pixelDiff: meanPixelDiff,
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
      dilationRadius = 4,
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
    const beforeCorner = new Uint8ClampedArray(cornerBuffer);

    const { mask, count, hasWatermark } = this.detectWatermarkMask(cornerBuffer, roi.w, roi.h, sensitivity);
    if (!hasWatermark || count < 8) {
      return { watermarkDetected: false, pixelsInpainted: 0, pixelDiff: 0, roi };
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

    let totalDiff = 0;
    const numPixels = roi.w * roi.h;
    for (let i = 0; i < beforeCorner.length; i += 4) {
      const dr = Math.abs(beforeCorner[i] - cornerBuffer[i]);
      const dg = Math.abs(beforeCorner[i + 1] - cornerBuffer[i + 1]);
      const db = Math.abs(beforeCorner[i + 2] - cornerBuffer[i + 2]);
      totalDiff += (dr + dg + db) / 3;
    }
    const meanPixelDiff = numPixels > 0 ? (totalDiff / numPixels) : 0;

    return {
      watermarkDetected: true,
      pixelsInpainted: count,
      pixelDiff: meanPixelDiff,
      roi
    };
  }

  /**
   * Computes Region of Interest (ROI) box
   * Dynamically adapts to video and image aspect ratio:
   * Vertical/Portrait videos (9:16 reels/shorts) have inset watermarks (safe margins),
   * while Landscape/Square frames place watermarks closer to outer corners.
   */
  static getROI(width, height, corner = 'bottom-right', customROI = null) {
    if (customROI && customROI.w && customROI.h) {
      const x = Math.max(0, Math.min(width - 2, Math.floor(customROI.x || 0)));
      const y = Math.max(0, Math.min(height - 2, Math.floor(customROI.y || 0)));
      const w = Math.min(width - x, Math.floor(customROI.w));
      const h = Math.min(height - y, Math.floor(customROI.h));
      return { x, y, w, h };
    }

    const isPortrait = height > width;
    const wRatio = isPortrait ? 0.28 : 0.20;
    const hRatio = isPortrait ? 0.22 : 0.20;
    const minDim = isPortrait ? 120 : 60;

    const w = Math.max(minDim, Math.min(width, Math.round(width * wRatio)));
    const h = Math.max(minDim, Math.min(height, Math.round(height * hRatio)));

    if (corner === 'bottom-left') {
      return { x: 0, y: height - h, w, h };
    } else if (corner === 'top-right') {
      return { x: width - w, y: 0, w, h };
    } else if (corner === 'top-left') {
      return { x: 0, y: 0, w, h };
    } else {
      // 'bottom-right' (Gemini, Imagen, Veo, DALL-E)
      return { x: width - w, y: height - h, w, h };
    }
  }

  /**
   * Adaptive Gemini Sparkle & Badge Mask Detection
   * Analyzes local background luminance via perimeter sampling, chroma neutrality, and specular core.
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

    // 2. Adaptive perimeter sampling for true local background estimation
    // Sampling at radius ensures the watermark's own bright star core never bleeds into background lum!
    const rad = Math.min(24, Math.max(12, Math.round(Math.min(w, h) * 0.08)));
    const d = Math.round(rad * 0.707);
    const threshDelta = 7 / Math.max(0.5, sensitivity);
    let count = 0;

    for (let y = 2; y < h - 2; y++) {
      const yT = Math.max(0, y - rad);
      const yB = Math.min(h - 1, y + rad);
      const yTd = Math.max(0, y - d);
      const yBd = Math.min(h - 1, y + d);

      for (let x = 2; x < w - 2; x++) {
        const idx = y * w + x;
        const l = lum[idx];
        const s = sat[idx];

        const xL = Math.max(0, x - rad);
        const xR = Math.min(w - 1, x + rad);
        const xLd = Math.max(0, x - d);
        const xRd = Math.min(w - 1, x + d);

        const bg = (
          lum[yT * w + x] +
          lum[yB * w + x] +
          lum[y * w + xL] +
          lum[y * w + xR] +
          lum[yTd * w + xLd] +
          lum[yTd * w + xRd] +
          lum[yBd * w + xLd] +
          lum[yBd * w + xRd]
        ) * 0.125; // / 8

        const delta = l - bg;

        // Gemini sparkle & badge watermark characteristics:
        // - Bright/translucent highlight relative to local perimeter background (delta > threshDelta, low chroma, luminance > 55)
        // - Or contrast edge deviation (Math.abs(delta) > threshDelta * 1.3, low chroma, luminance > 40)
        // - Or specular star core (l > 120 with low chroma saturation and positive delta)
        const isBrightDeviation = (delta > threshDelta && s < 68 && l > 55) ||
                                  (Math.abs(delta) > threshDelta * 1.3 && s < 50 && l > 40);
        const isSpecularCore = (l > 120 && s < 50 && delta > 4) || (l > 185 && s < 55);

        if (isBrightDeviation || isSpecularCore) {
          mask[idx] = 1;
          count++;
        }
      }
    }

    if (count < 8) {
      return { mask, count: 0, hasWatermark: false };
    }

    // 3. Connected Component Analysis & Watermark Cluster Isolation
    // Discards sprawling background edges, shadows, and clothing folds (spanning > 55% of ROI)
    const visited = new Uint8Array(totalPixels);
    const components = [];
    const maxSpanW = Math.round(w * 0.55);
    const maxSpanH = Math.round(h * 0.55);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] === 1 && visited[idx] === 0) {
          const comp = { pixels: [], minX: x, maxX: x, minY: y, maxY: y };
          const queue = [idx];
          visited[idx] = 1;

          while (queue.length > 0) {
            const curr = queue.pop();
            comp.pixels.push(curr);
            const cy = Math.floor(curr / w);
            const cx = curr % w;
            comp.minX = Math.min(comp.minX, cx);
            comp.maxX = Math.max(comp.maxX, cx);
            comp.minY = Math.min(comp.minY, cy);
            comp.maxY = Math.max(comp.maxY, cy);

            if (cx > 0 && mask[curr - 1] === 1 && visited[curr - 1] === 0) {
              visited[curr - 1] = 1; queue.push(curr - 1);
            }
            if (cx < w - 1 && mask[curr + 1] === 1 && visited[curr + 1] === 0) {
              visited[curr + 1] = 1; queue.push(curr + 1);
            }
            if (cy > 0 && mask[curr - w] === 1 && visited[curr - w] === 0) {
              visited[curr - w] = 1; queue.push(curr - w);
            }
            if (cy < h - 1 && mask[curr + w] === 1 && visited[curr + w] === 0) {
              visited[curr + w] = 1; queue.push(curr + w);
            }
          }
          components.push(comp);
        }
      }
    }

    const validWatermarks = [];
    for (const c of components) {
      const bw = c.maxX - c.minX + 1;
      const bh = c.maxY - c.minY + 1;
      const size = c.pixels.length;

      // Discard small noise specks and huge sprawling edges
      if (size < 8 || size > 3000) continue;
      if (bw > maxSpanW || bh > maxSpanH) continue; // Sprawls across >55% of ROI is an object/edge!

      let peakLum = 0;
      let neutralCount = 0;
      for (const pIdx of c.pixels) {
        const p = pIdx * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        if (l > peakLum) peakLum = l;
        if (Math.max(r, g, b) - Math.min(r, g, b) < 55) neutralCount++;
      }

      const neutrality = neutralCount / size;
      if (neutrality < 0.5) continue;

      const ar = Math.min(bw, bh) / Math.max(bw, bh);
      const touchesBorder = (c.minX <= 2 || c.maxX >= w - 3 || c.minY <= 2 || c.maxY >= h - 3);

      let score = size;
      if (ar > 0.45) score *= 2.0;
      if (!touchesBorder) score *= 1.8;
      if (peakLum > 160) score *= 1.5;

      validWatermarks.push({ comp: c, score, bw, bh });
    }

    validWatermarks.sort((a, b) => b.score - a.score);

    const filteredMask = new Uint8Array(totalPixels);
    let filteredCount = 0;

    // Retain only authentic watermark cluster(s)
    if (validWatermarks.length > 0) {
      const top = validWatermarks[0];
      for (const pIdx of top.comp.pixels) {
        filteredMask[pIdx] = 1;
        filteredCount++;
      }
      for (let i = 1; i < Math.min(3, validWatermarks.length); i++) {
        const second = validWatermarks[i];
        if (second.score >= top.score * 0.45) {
          for (const pIdx of second.comp.pixels) {
            filteredMask[pIdx] = 1;
            filteredCount++;
          }
        }
      }
    }

    const minPixels = 6;
    const maxPixels = Math.floor(totalPixels * 0.35);
    const hasWatermark = filteredCount >= minPixels && filteredCount <= maxPixels;

    return { mask: filteredMask, count: filteredCount, hasWatermark };
  }

  /**
   * Morphological Dilation (expands mask outward by radius to swallow halo fringes)
   */
  static dilateMask(mask, w, h, radius = 4) {
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
              const dist = Math.sqrt(distSq);
              const weight = 1.0 / (distSq * dist + 0.001); // Inverse cubic distance weight

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

/**
 * 100% Client-Side Gemini / AI Bottom-Right Watermark Remover
 * - Leaves 99% of the image bit-for-bit untouched (Zero Quality Loss)
 * - Auto-detects bright/translucent sparkle watermarks in the bottom-right ROI
 * - Uses Boundary-Inward Fast Marching (Telea-style) + Local Grain Matching
 * 
 * @param {CanvasRenderingContext2D} ctx 
 * @param {number} width 
 * @param {number} height 
 * @param {Object} options 
 * @returns {Object} { removed: boolean, pixelsHealed: number }
 */
export function removeGeminiCornerWatermark(ctx, width, height, options = {}) {
  const isPortrait = height > width;
  const defaultWRatio = isPortrait ? 0.28 : 0.20;
  const defaultHRatio = isPortrait ? 0.22 : 0.20;

  const {
    roiWidthRatio = defaultWRatio,
    roiHeightRatio = defaultHRatio,
    sensitivity = 11,
    dilateRadius = 3
  } = options;

  const minDim = isPortrait ? 120 : 60;
  const roiW = Math.max(minDim, Math.round(width * roiWidthRatio));
  const roiH = Math.max(minDim, Math.round(height * roiHeightRatio));
  const startX = width - roiW;
  const startY = height - roiH;

  // Sirf bottom-right ROI ke pixels extract karein (Baaki 99% image untouched rahegi!)
  const roiImage = ctx.getImageData(startX, startY, roiW, roiH);
  const data = roiImage.data;

  // Step 1: Detect watermark mask inside ROI using local background estimation
  const rawMask = new Uint8Array(roiW * roiH);
  const win = 11; // Local neighborhood radius

  for (let y = 4; y < roiH - 4; y++) {
    for (let x = 4; x < roiW - 4; x++) {
      const idx = (y * roiW + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Sample perimeter of local box to estimate underlying background luminance
      let bgLumSum = 0, count = 0;
      for (let dy = -win; dy <= win; dy += win) {
        for (let dx = -win; dx <= win; dx += win) {
          if (dx === 0 && dy === 0) continue;
          const nx = Math.min(roiW - 1, Math.max(0, x + dx));
          const ny = Math.min(roiH - 1, Math.max(0, y + dy));
          const nIdx = (ny * roiW + nx) * 4;
          bgLumSum += 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
          count++;
        }
      }
      const bgLum = bgLumSum / count;

      // Gemini watermark is brighter than local background & low color saturation (white/silver sparkle)
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

      if (lum - bgLum > sensitivity && saturation < 0.38 && lum > 115) {
        rawMask[y * roiW + x] = 1;
      }
    }
  }

  // Step 2: Morphological Dilation (taaki watermark ki soft edges/glow bhi poori tarah cover ho)
  const mask = new Uint8Array(roiW * roiH);
  let maskedCount = 0;
  for (let y = 0; y < roiH; y++) {
    for (let x = 0; x < roiW; x++) {
      let found = 0;
      for (let dy = -dilateRadius; dy <= dilateRadius && !found; dy++) {
        for (let dx = -dilateRadius; dx <= dilateRadius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < roiW && ny >= 0 && ny < roiH && rawMask[ny * roiW + nx]) {
            found = 1;
            break;
          }
        }
      }
      mask[y * roiW + x] = found;
      if (found) maskedCount++;
    }
  }

  // Agar koi watermark detect nahi hua, toh 100% untouched chhod dein
  if (maskedCount === 0) return { removed: false, pixelsHealed: 0 };

  // Step 3: Boundary-Inward Fast Marching Inpainting + Texture Grain Preservation
  // Outer ring se andar ki taraf layer-by-layer heal karein
  const workingMask = new Uint8Array(mask);
  const searchRadius = 4;
  let remaining = maskedCount;
  let maxPasses = Math.max(roiW, roiH);

  while (remaining > 0 && maxPasses-- > 0) {
    const boundaryPixels = [];

    // Find current boundary pixels (masked pixels touching at least 1 unmasked pixel)
    for (let y = 1; y < roiH - 1; y++) {
      for (let x = 1; x < roiW - 1; x++) {
        const p = y * roiW + x;
        if (workingMask[p] === 1) {
          if (
            workingMask[p - 1] === 0 ||
            workingMask[p + 1] === 0 ||
            workingMask[p - roiW] === 0 ||
            workingMask[p + roiW] === 0
          ) {
            boundaryPixels.push([x, y]);
          }
        }
      }
    }

    if (boundaryPixels.length === 0) break;

    for (const [x, y] of boundaryPixels) {
      let rSum = 0, gSum = 0, bSum = 0, weightSum = 0;

      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < roiW && ny >= 0 && ny < roiH) {
            const np = ny * roiW + nx;
            if (workingMask[np] === 0) {
              const distSq = dx * dx + dy * dy;
              const weight = 1 / (distSq * Math.sqrt(distSq)); // Inverse cubic distance weight
              const nIdx = np * 4;
              rSum += data[nIdx] * weight;
              gSum += data[nIdx + 1] * weight;
              bSum += data[nIdx + 2] * weight;
              weightSum += weight;
            }
          }
        }
      }

      if (weightSum > 0) {
        const idx = (y * roiW + x) * 4;
        // Subtle micro-grain matching so healed area blends naturally with photo noise
        const grain = (Math.random() - 0.5) * 2.5;
        data[idx]     = Math.min(255, Math.max(0, Math.round(rSum / weightSum + grain)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(gSum / weightSum + grain)));
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(bSum / weightSum + grain)));
      }
    }

    for (const [x, y] of boundaryPixels) {
      workingMask[y * roiW + x] = 0;
      remaining--;
    }
  }

  // Sirf healed ROI ko wapas canvas par put karein
  ctx.putImageData(roiImage, startX, startY);
  return { removed: true, pixelsHealed: maskedCount };
}
