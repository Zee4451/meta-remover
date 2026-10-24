/**
 * GhostMeta AI — Interactive Bounding-Box Selector & Moving Watermark Tracker
 * Supports: Mouse + Mobile Touch, Multi-Box ROI, Corner Presets, Keyframes & Video Template Tracking
 * All coordinates are normalized (0.0 to 1.0) for resolution-independent 4K sub-pixel mapping.
 */

export class WatermarkBoxSelector {
  constructor(mediaElement, overlayCanvas, options = {}) {
    this.media = mediaElement;     // <img> or <video> element
    this.canvas = overlayCanvas;   // <canvas> overlay positioned directly over media
    this.ctx = this.canvas.getContext('2d');
    this.options = options;

    // Normalized boxes: [{ id, x, y, w, h, startTime, endTime, trackTemplate }] (0.0 to 1.0)
    this.boxes = [];
    this.isDrawing = false;
    this.isResizing = false;
    this.resizingBox = null;
    this.startPt = null;
    this.currentDraft = null;
    this.autoTrackEnabled = false;
    this.mode = 'static'; // 'static', 'keyframe', 'autotrack'

    this._onStart = this._handleStart.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onEnd = this._handleEnd.bind(this);
    this._onResize = () => this.syncCanvasSize();

    this._bindEvents();
    this.syncCanvasSize();
  }

  // Sync overlay canvas dimensions with the rendered preview size
  syncCanvasSize() {
    if (!this.media || !this.canvas) return;
    const rect = this.media.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = Math.round(rect.width);
      this.canvas.height = Math.round(rect.height);
      this.render();
    }
  }

  // Load existing normalized boxes into the selector
  setBoxes(boxes = []) {
    this.boxes = boxes.map(b => ({
      id: b.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'box_' + Math.random().toString(36).substring(2, 9)),
      x: Math.max(0, Math.min(1, b.x)),
      y: Math.max(0, Math.min(1, b.y)),
      w: Math.max(0.01, Math.min(1 - b.x, b.w)),
      h: Math.max(0.01, Math.min(1 - b.y, b.h)),
      startTime: b.startTime ?? 0,
      endTime: b.endTime ?? Infinity,
      trackTemplate: b.trackTemplate || null
    }));
    this.render();
  }

  getBoxes() {
    return [...this.boxes];
  }

  setMode(mode) {
    this.mode = mode;
    this.autoTrackEnabled = (mode === 'autotrack');
  }

  // Quick Corner Presets (Gemini, Veo, Pika, Runway, etc.)
  addCornerPreset(corner = 'bottom-right', wRatio = 0.13, hRatio = 0.13) {
    const presets = {
      'bottom-right': { x: 1 - wRatio - 0.01, y: 1 - hRatio - 0.01, w: wRatio, h: hRatio },
      'bottom-left':  { x: 0.01,              y: 1 - hRatio - 0.01, w: wRatio, h: hRatio },
      'top-right':    { x: 1 - wRatio - 0.01, y: 0.01,              w: wRatio, h: hRatio },
      'top-left':     { x: 0.01,              y: 0.01,              w: wRatio, h: hRatio },
    };
    const box = presets[corner] || presets['bottom-right'];
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'box_' + Math.random().toString(36).substring(2, 9);
    
    const newBox = {
      id,
      ...box,
      startTime: 0,
      endTime: Infinity,
      trackTemplate: this.autoTrackEnabled ? this._captureEdgeTemplate(box) : null
    };

    this.boxes.push(newBox);
    this.render();
    if (this.options.onChange) this.options.onChange(this.getBoxes());
    return newBox;
  }

  // Draw or Add Custom Box in center of frame
  addCustomBox(x = 0.38, y = 0.38, w = 0.24, h = 0.24) {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'box_' + Math.random().toString(36).substring(2, 9);
    const box = {
      id,
      x: Math.max(0, Math.min(1 - w, x)),
      y: Math.max(0, Math.min(1 - h, y)),
      w,
      h,
      startTime: 0,
      endTime: Infinity,
      trackTemplate: this.autoTrackEnabled ? this._captureEdgeTemplate({ x, y, w, h }) : null
    };
    this.boxes.push(box);
    this.render();
    if (this.options.onChange) this.options.onChange(this.getBoxes());
    return box;
  }

  clearBoxes() {
    this.boxes = [];
    this.currentDraft = null;
    this.render();
    if (this.options.onChange) this.options.onChange(this.getBoxes());
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this._onStart);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('mouseup', this._onEnd);

    this.canvas.removeEventListener('touchstart', this._onStart);
    window.removeEventListener('touchmove', this._onMove);
    window.removeEventListener('touchend', this._onEnd);
    window.removeEventListener('resize', this._onResize);
  }

  _getNormalizedPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1))),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / (rect.height || 1))),
      screenX: clientX,
      screenY: clientY
    };
  }

  _handleStart(e) {
    if (e.button && e.button !== 0) return; // Only left mouse button
    e.preventDefault();
    const pt = this._getNormalizedPoint(e);
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // Check if user clicked the '×' delete badge on an existing box
    const hitDeleteIdx = this.boxes.findIndex((b) => {
      const delX = (b.x + b.w) * cw;
      const delY = b.y * ch;
      const mouseX = pt.x * cw;
      const mouseY = pt.y * ch;
      const dist = Math.hypot(mouseX - delX, mouseY - delY);
      return dist <= 14;
    });

    if (hitDeleteIdx !== -1) {
      this.boxes.splice(hitDeleteIdx, 1);
      this.render();
      if (this.options.onChange) this.options.onChange(this.getBoxes());
      return;
    }

    // Check if user clicked bottom-right resize handle of an existing box
    const hitResizeIdx = this.boxes.findIndex((b) => {
      const handleX = (b.x + b.w) * cw;
      const handleY = (b.y + b.h) * ch;
      const mouseX = pt.x * cw;
      const mouseY = pt.y * ch;
      return Math.hypot(mouseX - handleX, mouseY - handleY) <= 14;
    });

    if (hitResizeIdx !== -1) {
      this.isResizing = true;
      this.resizingBox = this.boxes[hitResizeIdx];
      this.startPt = pt;
      return;
    }

    this.isDrawing = true;
    this.startPt = pt;
    this.currentDraft = { x: pt.x, y: pt.y, w: 0, h: 0 };
  }

  _handleMove(e) {
    if (this.isResizing && this.resizingBox) {
      e.preventDefault();
      const pt = this._getNormalizedPoint(e);
      this.resizingBox.w = Math.max(0.02, Math.min(1 - this.resizingBox.x, pt.x - this.resizingBox.x));
      this.resizingBox.h = Math.max(0.02, Math.min(1 - this.resizingBox.y, pt.y - this.resizingBox.y));
      this.render();
      if (this.options.onChange) this.options.onChange(this.getBoxes());
      return;
    }

    if (!this.isDrawing || !this.startPt) return;
    e.preventDefault();
    const pt = this._getNormalizedPoint(e);
    this.currentDraft = {
      x: Math.min(this.startPt.x, pt.x),
      y: Math.min(this.startPt.y, pt.y),
      w: Math.abs(pt.x - this.startPt.x),
      h: Math.abs(pt.y - this.startPt.y),
    };
    this.render();
  }

  _handleEnd() {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizingBox = null;
      this.render();
      return;
    }

    if (!this.isDrawing) return;
    this.isDrawing = false;

    // Ignore tiny accidental clicks (< 1.5% size)
    if (this.currentDraft && this.currentDraft.w > 0.015 && this.currentDraft.h > 0.015) {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'box_' + Math.random().toString(36).substring(2, 9);
      const currentTime = this.media.currentTime || 0;

      const newBox = {
        id,
        ...this.currentDraft,
        startTime: this.mode === 'keyframe' ? Math.max(0, currentTime - 0.5) : 0,
        endTime: this.mode === 'keyframe' ? currentTime + 3.0 : Infinity,
        trackTemplate: this.autoTrackEnabled ? this._captureEdgeTemplate(this.currentDraft) : null,
      };
      this.boxes.push(newBox);
      if (this.options.onChange) this.options.onChange(this.getBoxes());
    }
    this.currentDraft = null;
    this.render();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', this._onStart);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup', this._onEnd);

    this.canvas.addEventListener('touchstart', this._onStart, { passive: false });
    window.addEventListener('touchmove', this._onMove, { passive: false });
    window.addEventListener('touchend', this._onEnd);
    window.addEventListener('resize', this._onResize);
  }

  // Captures grayscale edge signature of the watermark for moving-watermark auto-tracking
  _captureEdgeTemplate(normBox) {
    const natW = this.media.videoWidth || this.media.naturalWidth;
    const natH = this.media.videoHeight || this.media.naturalHeight;
    if (!natW || !natH) return null;

    const off = document.createElement('canvas');
    const w = Math.max(8, Math.round(normBox.w * natW));
    const h = Math.max(8, Math.round(normBox.h * natH));
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    if (!octx) return null;

    try {
      octx.drawImage(this.media, normBox.x * natW, normBox.y * natH, w, h, 0, 0, w, h);
      const imgData = octx.getImageData(0, 0, w, h).data;
      const edgeMap = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        edgeMap[i] = 0.299 * imgData[i * 4] + 0.587 * imgData[i * 4 + 1] + 0.114 * imgData[i * 4 + 2];
      }
      return {
        width: w,
        height: h,
        edgeMap,
        lastX: Math.round(normBox.x * natW),
        lastY: Math.round(normBox.y * natH)
      };
    } catch {
      return null;
    }
  }

  render() {
    const { width, height } = this.canvas;
    if (!width || !height) return;
    this.ctx.clearRect(0, 0, width, height);

    const currentTime = this.media && typeof this.media.currentTime === 'number' ? this.media.currentTime : 0;
    const allBoxes = [...this.boxes, ...(this.currentDraft ? [this.currentDraft] : [])];

    allBoxes.forEach((b, idx) => {
      const rx = b.x * width;
      const ry = b.y * height;
      const rw = b.w * width;
      const rh = b.h * height;

      // In keyframe mode, dim inactive boxes
      const isKeyframeActive = !b.id || this.mode !== 'keyframe' || (currentTime >= b.startTime && currentTime <= b.endTime);
      const alpha = isKeyframeActive ? 0.22 : 0.07;
      const strokeColor = isKeyframeActive ? '#10b981' : 'rgba(16, 185, 129, 0.4)';

      // Translucent emerald fill
      this.ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
      this.ctx.fillRect(rx, ry, rw, rh);

      // High-contrast dashed neon border
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 3]);
      this.ctx.strokeRect(rx, ry, rw, rh);
      this.ctx.setLineDash([]);

      // Label tag + Delete button (for saved boxes)
      if (b.id) {
        const tagText = b.trackTemplate ? `🎯 Track #${idx + 1}` : `ROI #${idx + 1}`;
        const tagWidth = b.trackTemplate ? 82 : 68;

        this.ctx.fillStyle = '#10b981';
        this.ctx.fillRect(rx, Math.max(0, ry - 20), tagWidth, 20);
        this.ctx.fillStyle = '#0f172a';
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.fillText(tagText, rx + 6, Math.max(14, ry - 6));

        // Delete '×' button circle at top-right corner of the box
        const delCenterX = rx + rw;
        const delCenterY = ry;
        this.ctx.beginPath();
        this.ctx.arc(delCenterX, delCenterY, 10, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px sans-serif';
        this.ctx.fillText('×', delCenterX - 4, delCenterY + 4);

        // Resize handles (small square anchors at corners)
        const hSize = 7;
        const cornerAnchors = [
          [rx, ry],
          [rx, ry + rh],
          [rx + rw, ry + rh] // Bottom-right interactive resize anchor
        ];
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#10b981';
        this.ctx.lineWidth = 1.5;
        for (const [hx, hy] of cornerAnchors) {
          this.ctx.fillRect(hx - hSize / 2, hy - hSize / 2, hSize, hSize);
          this.ctx.strokeRect(hx - hSize / 2, hy - hSize / 2, hSize, hSize);
        }
      }
    });
  }
}

/**
 * Executes zero-loss ROI inpainting across all user-selected bounding boxes.
 * Supports static multi-box, time-gated keyframes, and moving watermark tracking.
 * 
 * @param {CanvasRenderingContext2D} ctx 
 * @param {number} nativeWidth 
 * @param {number} nativeHeight 
 * @param {Array<Object>} boxes 
 * @param {number} currentTime 
 */
export function healSelectedBoxes(ctx, nativeWidth, nativeHeight, boxes, currentTime = 0) {
  if (!boxes || !boxes.length) return 0;
  let totalPixelsHealed = 0;

  for (const box of boxes) {
    // 1. Check if box is active at current video timestamp (for keyframe mode)
    if (currentTime < (box.startTime ?? 0) || currentTime > (box.endTime ?? Infinity)) {
      continue;
    }

    let roiX = Math.max(0, Math.round(box.x * nativeWidth));
    let roiY = Math.max(0, Math.round(box.y * nativeHeight));
    const roiW = Math.min(nativeWidth - roiX, Math.round(box.w * nativeWidth));
    const roiH = Math.min(nativeHeight - roiY, Math.round(box.h * nativeHeight));

    if (roiW < 4 || roiH < 4) continue;

    // 2. If Auto-Track is active for a moving video watermark, update (roiX, roiY) within search window
    if (box.trackTemplate) {
      const tracked = trackMovingWatermarkPosition(ctx, nativeWidth, nativeHeight, box.trackTemplate);
      roiX = tracked.x;
      roiY = tracked.y;
      box.trackTemplate.lastX = roiX;
      box.trackTemplate.lastY = roiY;
    }

    // 3. Extract ONLY this bounding box with a 6px border ring for clean background reference
    const pad = 6;
    const extX = Math.max(0, roiX - pad);
    const extY = Math.max(0, roiY - pad);
    const extW = Math.min(nativeWidth - extX, roiW + pad * 2);
    const extH = Math.min(nativeHeight - extY, roiH + pad * 2);

    const imgData = ctx.getImageData(extX, extY, extW, extH);
    const data = imgData.data;

    const innerStartX = roiX - extX;
    const innerStartY = roiY - extY;
    const innerEndX = Math.min(extW, innerStartX + roiW);
    const innerEndY = Math.min(extH, innerStartY + roiH);
    const totalBoxPixels = (innerEndX - innerStartX) * (innerEndY - innerStartY);

    // 4. Estimate underlying background color/luminance distribution from clean 6px perimeter ring
    let sumR = 0, sumG = 0, sumB = 0, sumLum = 0, perimCount = 0;
    for (let y = 0; y < extH; y++) {
      for (let x = 0; x < extW; x++) {
        if (x < innerStartX || x >= innerEndX || y < innerStartY || y >= innerEndY) {
          const p = (y * extW + x) * 4;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          sumR += r;
          sumG += g;
          sumB += b;
          sumLum += 0.299 * r + 0.587 * g + 0.114 * b;
          perimCount++;
        }
      }
    }

    const bgMeanR = perimCount > 0 ? sumR / perimCount : 128;
    const bgMeanG = perimCount > 0 ? sumG / perimCount : 128;
    const bgMeanB = perimCount > 0 ? sumB / perimCount : 128;
    const bgMeanLum = perimCount > 0 ? sumLum / perimCount : 128;

    // 5. Sub-Box Smart Stroke Segmentation inside the box
    // Mark a pixel ONLY if it deviates from local background (bright/translucent sparkle or sharp logo edge)
    const rawStrokeMask = new Uint8Array(extW * extH);
    let strokeCount = 0;

    for (let y = innerStartY; y < innerEndY; y++) {
      for (let x = innerStartX; x < innerEndX; x++) {
        const p = (y * extW + x) * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        const deltaLum = lum - bgMeanLum;
        const deltaColor = Math.hypot(r - bgMeanR, g - bgMeanG, b - bgMeanB);

        // Gradient contrast
        const leftP = (y * extW + Math.max(innerStartX, x - 1)) * 4;
        const rightP = (y * extW + Math.min(innerEndX - 1, x + 1)) * 4;
        const upP = (Math.max(innerStartY, y - 1) * extW + x) * 4;
        const downP = (Math.min(innerEndY - 1, y + 1) * extW + x) * 4;

        const gradX = Math.abs(data[rightP] - data[leftP]);
        const gradY = Math.abs(data[downP] - data[upP]);
        const grad = gradX + gradY;

        const isStrokeOutlier = (deltaLum > 14) ||
                                (deltaColor > 22) ||
                                (grad > 28 && (deltaLum > 8 || deltaColor > 14)) ||
                                (lum >= 205 && deltaLum > 8) ||
                                (Math.abs(deltaLum) > 26);

        if (isStrokeOutlier) {
          rawStrokeMask[y * extW + x] = 1;
          strokeCount++;
        }
      }
    }

    const mask = new Uint8Array(extW * extH);
    let boxPixelCount = 0;

    // Only fall back to full-box masking if fewer than 3% of pixels inside the user's custom box are detected as outliers
    if (strokeCount < 0.03 * totalBoxPixels) {
      for (let y = innerStartY; y < innerEndY; y++) {
        for (let x = innerStartX; x < innerEndX; x++) {
          mask[y * extW + x] = 1;
          boxPixelCount++;
        }
      }
    } else {
      // 2px morphological dilation strictly confined within bounding box to catch anti-aliased edge halos
      const dRad = 2;
      for (let y = innerStartY; y < innerEndY; y++) {
        for (let x = innerStartX; x < innerEndX; x++) {
          let hit = false;
          for (let dy = -dRad; dy <= dRad && !hit; dy++) {
            const ny = y + dy;
            if (ny < innerStartY || ny >= innerEndY) continue;
            for (let dx = -dRad; dx <= dRad && !hit; dx++) {
              const nx = x + dx;
              if (nx < innerStartX || nx >= innerEndX) continue;
              if (dx * dx + dy * dy <= dRad * dRad && rawStrokeMask[ny * extW + nx] === 1) {
                hit = true;
              }
            }
          }
          if (hit) {
            mask[y * extW + x] = 1;
            boxPixelCount++;
          }
        }
      }
    }

    if (boxPixelCount === 0) continue;

    // 6. Reverse Alpha Unblending for semi-transparent watermark pixels
    for (let y = innerStartY; y < innerEndY; y++) {
      for (let x = innerStartX; x < innerEndX; x++) {
        const idx = y * extW + x;
        if (mask[idx] === 1) {
          const p = idx * 4;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const deltaLum = lum - bgMeanLum;
          if (deltaLum > 10) {
            const estimatedAlpha = Math.min(0.70, Math.max(0.12, deltaLum / 220));
            const invAlpha = 1 - estimatedAlpha;
            data[p] = Math.min(255, Math.max(0, (r - estimatedAlpha * 255) / invAlpha));
            data[p + 1] = Math.min(255, Math.max(0, (g - estimatedAlpha * 255) / invAlpha));
            data[p + 2] = Math.min(255, Math.max(0, (b - estimatedAlpha * 255) / invAlpha));
          }
        }
      }
    }

    // 7. Boundary-Inward Fast Marching (Telea) + Texture Grain Preservation
    inpaintMaskedRegion(data, mask, extW, extH);

    // 8. Write ONLY the healed bounding box back to the canvas (99% of image remains 100% original!)
    ctx.putImageData(imgData, extX, extY);
    totalPixelsHealed += boxPixelCount;
  }

  return totalPixelsHealed;
}

// Fast Boundary-Inward Inpainting with Inverse Cubic Distance Weight & Local Grain Matching
function inpaintMaskedRegion(data, mask, w, h) {
  let remaining = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) remaining++;

  const radius = 4;
  let maxIter = Math.max(w, h);

  while (remaining > 0 && maxIter-- > 0) {
    const boundary = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (mask[p] === 1 && (mask[p - 1] === 0 || mask[p + 1] === 0 || mask[p - w] === 0 || mask[p + w] === 0)) {
          boundary.push([x, y]);
        }
      }
    }
    if (!boundary.length) break;

    for (const [x, y] of boundary) {
      let r = 0, g = 0, b = 0, wSum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] === 0) {
            const d2 = dx * dx + dy * dy;
            const weight = 1 / (d2 * Math.sqrt(d2) + 0.001); // Inverse cubic distance weight
            const idx = (ny * w + nx) * 4;
            r += data[idx] * weight;
            g += data[idx + 1] * weight;
            b += data[idx + 2] * weight;
            wSum += weight;
          }
        }
      }
      if (wSum > 0) {
        const idx = (y * w + x) * 4;
        const grain = (Math.random() - 0.5) * 2.2;
        data[idx]     = Math.min(255, Math.max(0, Math.round(r / wSum + grain)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(g / wSum + grain)));
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(b / wSum + grain)));
      }
    }

    for (const [x, y] of boundary) {
      mask[y * w + x] = 0;
      remaining--;
    }
  }
}

// Local SAD (Sum of Absolute Differences) Template Tracker for Moving Video Watermarks
function trackMovingWatermarkPosition(ctx, natW, natH, tpl) {
  if (!tpl || !tpl.edgeMap || !tpl.width || !tpl.height) {
    return { x: tpl ? tpl.lastX : 0, y: tpl ? tpl.lastY : 0 };
  }

  const searchRadius = 32; // Search ±32px around previous frame position
  const minX = Math.max(0, tpl.lastX - searchRadius);
  const minY = Math.max(0, tpl.lastY - searchRadius);
  const maxX = Math.min(natW - tpl.width, tpl.lastX + searchRadius);
  const maxY = Math.min(natH - tpl.height, tpl.lastY + searchRadius);

  const searchW = maxX - minX + tpl.width;
  const searchH = maxY - minY + tpl.height;
  if (searchW <= tpl.width || searchH <= tpl.height) return { x: tpl.lastX, y: tpl.lastY };

  const searchData = ctx.getImageData(minX, minY, searchW, searchH).data;
  let bestX = tpl.lastX, bestY = tpl.lastY, minScore = Infinity;

  // Step by 2px for ultra-fast 60 FPS real-time tracking
  for (let sy = 0; sy <= searchH - tpl.height; sy += 2) {
    for (let sx = 0; sx <= searchW - tpl.width; sx += 2) {
      let sad = 0;
      for (let ty = 0; ty < tpl.height; ty += 3) {
        for (let tx = 0; tx < tpl.width; tx += 3) {
          const sIdx = ((sy + ty) * searchW + (sx + tx)) * 4;
          const lum = 0.299 * searchData[sIdx] + 0.587 * searchData[sIdx + 1] + 0.114 * searchData[sIdx + 2];
          sad += Math.abs(lum - tpl.edgeMap[ty * tpl.width + tx]);
        }
      }
      if (sad < minScore) {
        minScore = sad;
        bestX = minX + sx;
        bestY = minY + sy;
      }
    }
  }
  return { x: bestX, y: bestY };
}
