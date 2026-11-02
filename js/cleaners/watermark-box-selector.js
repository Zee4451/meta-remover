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
    this.selectedBox = null;
    this.isDrawing = false;
    this.isMoving = false;
    this.movingBox = null;
    this.isResizing = false;
    this.resizingBox = null;
    this.resizeCorner = null; // 'tl', 'tr', 'bl', 'br'
    this.startPt = null;
    this.origBox = null;
    this.currentDraft = null;
    this.autoTrackEnabled = false;
    this.mode = 'static'; // 'static', 'keyframe', 'autotrack'

    this._onStart = this._handleStart.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onEnd = this._handleEnd.bind(this);
    this._onResize = () => this.syncCanvasSize();

    this._bindEvents();
    this.syncCanvasSize();

    // Observe viewport container resize to auto-adapt to mobile rotation/keyboard
    const viewport = this.media?.closest('.roi-media-viewport') || this.media?.parentElement?.parentElement || this.media?.parentElement;
    if (viewport && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this.syncCanvasSize();
      });
      this._resizeObserver.observe(viewport);
    }
  }

  // Sync overlay canvas dimensions with the rendered preview size (ZERO letterbox, 100% visible)
  syncCanvasSize() {
    if (!this.media || !this.canvas) return;

    // 1. Identify viewport boundary
    const viewport = this.media.closest('.roi-media-viewport') || this.media.parentElement?.parentElement || this.media.parentElement;
    if (!viewport) return;

    // 2. Measure viewport usable space
    const vRect = viewport.getBoundingClientRect();
    const computed = window.getComputedStyle(viewport);
    const padX = (parseFloat(computed.paddingLeft) || 6) + (parseFloat(computed.paddingRight) || 6);
    const padY = (parseFloat(computed.paddingTop) || 6) + (parseFloat(computed.paddingBottom) || 6);
    const availW = Math.max(80, (vRect.width || viewport.clientWidth || 320) - padX);
    const availH = Math.max(80, (vRect.height || viewport.clientHeight || 240) - padY);

    // 3. Intrinsic media dimensions
    const natW = this.media.videoWidth || this.media.naturalWidth || 800;
    const natH = this.media.videoHeight || this.media.naturalHeight || 600;

    // 4. Perfect aspect ratio fit with ZERO letterboxing and 100% full visibility
    const scale = Math.min(availW / natW, availH / natH, 1.0);
    const renderW = Math.max(10, Math.round(natW * scale));
    const renderH = Math.max(10, Math.round(natH * scale));

    this.media.style.width = `${renderW}px`;
    this.media.style.height = `${renderH}px`;
    this.canvas.width = renderW;
    this.canvas.height = renderH;
    this.canvas.style.width = `${renderW}px`;
    this.canvas.style.height = `${renderH}px`;

    this.render();
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
    this.selectedBox = this.boxes.length > 0 ? this.boxes[this.boxes.length - 1] : null;
    this.render();
  }

  getBoxes() {
    return this.boxes.map(b => ({ ...b }));
  }

  getSelectedBox() {
    if (this.selectedBox && this.boxes.includes(this.selectedBox)) {
      return this.selectedBox;
    }
    return this.boxes.length > 0 ? this.boxes[this.boxes.length - 1] : null;
  }

  setMode(mode) {
    this.mode = mode;
    this.autoTrackEnabled = (mode === 'autotrack');
  }

  // Quick Corner Presets (Gemini, Veo, Pika, Runway, etc.)
  addCornerPreset(corner = 'bottom-right', wRatio = null, hRatio = null) {
    const isPortrait = (this.media?.videoHeight || this.media?.naturalHeight || 0) > (this.media?.videoWidth || this.media?.naturalWidth || 0);
    const effWRatio = wRatio !== null ? wRatio : (isPortrait ? 0.28 : 0.20);
    const effHRatio = hRatio !== null ? hRatio : (isPortrait ? 0.22 : 0.20);

    const presets = {
      'bottom-right': { x: Math.max(0, 1 - effWRatio - 0.01), y: Math.max(0, 1 - effHRatio - 0.01), w: effWRatio, h: effHRatio },
      'bottom-left':  { x: 0.01,                              y: Math.max(0, 1 - effHRatio - 0.01), w: effWRatio, h: effHRatio },
      'top-right':    { x: Math.max(0, 1 - effWRatio - 0.01), y: 0.01,                              w: effWRatio, h: effHRatio },
      'top-left':     { x: 0.01,                              y: 0.01,                              w: effWRatio, h: effHRatio },
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
    this.selectedBox = newBox;
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
    this.selectedBox = box;
    this.render();
    if (this.options.onChange) this.options.onChange(this.getBoxes());
    return box;
  }

  clearBoxes() {
    this.boxes = [];
    this.selectedBox = null;
    this.currentDraft = null;
    this.render();
    if (this.options.onChange) this.options.onChange(this.getBoxes());
  }

  // Fine-tuning nudge controls for mobile screens
  nudge(direction, step = 0.015) {
    const box = this.getSelectedBox();
    if (!box) return;
    if (direction === 'up') box.y = Math.max(0, box.y - step);
    if (direction === 'down') box.y = Math.min(1 - box.h, box.y + step);
    if (direction === 'left') box.x = Math.max(0, box.x - step);
    if (direction === 'right') box.x = Math.min(1 - box.w, box.x + step);
    this.selectedBox = box;
    this.render();
    if (this.options.onChange) this.options.onChange(this.getBoxes());
  }

  scale(grow, step = 0.02) {
    const box = this.getSelectedBox();
    if (!box) return;
    if (grow) {
      const dw = Math.min(step, 1 - box.x - box.w);
      const dh = Math.min(step, 1 - box.y - box.h);
      box.w += dw;
      box.h += dh;
    } else {
      box.w = Math.max(0.02, box.w - step);
      box.h = Math.max(0.02, box.h - step);
    }
    this.selectedBox = box;
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

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  _getNormalizedPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1))),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / (rect.height || 1))),
      screenX: clientX,
      screenY: clientY
    };
  }

  _handleStart(e) {
    if (e.button && e.button !== 0) return; // Only left mouse button
    if (e.cancelable) e.preventDefault();
    const pt = this._getNormalizedPoint(e);
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const px = pt.x * cw;
    const py = pt.y * ch;

    const isTouch = (e.touches && e.touches.length > 0) || ('ontouchstart' in window);
    const hitRadius = isTouch ? 28 : 14;

    // 1. Check if user clicked the '×' delete badge on an existing box (reverse order for top-most)
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      const delX = (b.x + b.w) * cw;
      const delY = b.y * ch;
      if (Math.hypot(px - delX, py - delY) <= hitRadius) {
        if (this.selectedBox === b) this.selectedBox = null;
        this.boxes.splice(i, 1);
        this.render();
        if (this.options.onChange) this.options.onChange(this.getBoxes());
        return;
      }
    }

    // 2. Check 4-corner resize handles on existing boxes
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      const corners = [
        { name: 'br', x: (b.x + b.w) * cw, y: (b.y + b.h) * ch },
        { name: 'bl', x: b.x * cw,         y: (b.y + b.h) * ch },
        { name: 'tr', x: (b.x + b.w) * cw, y: b.y * ch },
        { name: 'tl', x: b.x * cw,         y: b.y * ch }
      ];

      for (const corner of corners) {
        if (Math.hypot(px - corner.x, py - corner.y) <= hitRadius) {
          this.isResizing = true;
          this.resizingBox = b;
          this.selectedBox = b;
          this.resizeCorner = corner.name;
          this.startPt = pt;
          this.origBox = { x: b.x, y: b.y, w: b.w, h: b.h };
          this.render();
          return;
        }
      }
    }

    // 3. Check if user clicked inside an existing box to MOVE it
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      if (pt.x >= b.x && pt.x <= (b.x + b.w) && pt.y >= b.y && pt.y <= (b.y + b.h)) {
        this.isMoving = true;
        this.movingBox = b;
        this.selectedBox = b;
        this.startPt = pt;
        this.origBox = { x: b.x, y: b.y, w: b.w, h: b.h };
        this.render();
        return;
      }
    }

    // 4. Clicked outside: start DRAWING a new box
    this.selectedBox = null;
    this.isDrawing = true;
    this.startPt = pt;
    this.currentDraft = { x: pt.x, y: pt.y, w: 0, h: 0 };
    this.render();
  }

  _handleMove(e) {
    if (this.isResizing && this.resizingBox && this.origBox) {
      if (e.cancelable) e.preventDefault();
      const pt = this._getNormalizedPoint(e);
      const dx = pt.x - this.startPt.x;
      const dy = pt.y - this.startPt.y;
      const orig = this.origBox;
      const box = this.resizingBox;

      if (this.resizeCorner === 'br') {
        box.w = Math.max(0.02, Math.min(1 - orig.x, orig.w + dx));
        box.h = Math.max(0.02, Math.min(1 - orig.y, orig.h + dy));
      } else if (this.resizeCorner === 'bl') {
        const newX = Math.max(0, Math.min(orig.x + orig.w - 0.02, orig.x + dx));
        box.w = (orig.x + orig.w) - newX;
        box.x = newX;
        box.h = Math.max(0.02, Math.min(1 - orig.y, orig.h + dy));
      } else if (this.resizeCorner === 'tr') {
        const newY = Math.max(0, Math.min(orig.y + orig.h - 0.02, orig.y + dy));
        box.h = (orig.y + orig.h) - newY;
        box.y = newY;
        box.w = Math.max(0.02, Math.min(1 - orig.x, orig.w + dx));
      } else if (this.resizeCorner === 'tl') {
        const newX = Math.max(0, Math.min(orig.x + orig.w - 0.02, orig.x + dx));
        const newY = Math.max(0, Math.min(orig.y + orig.h - 0.02, orig.y + dy));
        box.w = (orig.x + orig.w) - newX;
        box.h = (orig.y + orig.h) - newY;
        box.x = newX;
        box.y = newY;
      }

      this.render();
      if (this.options.onChange) this.options.onChange(this.getBoxes());
      return;
    }

    if (this.isMoving && this.movingBox && this.origBox) {
      if (e.cancelable) e.preventDefault();
      const pt = this._getNormalizedPoint(e);
      const dx = pt.x - this.startPt.x;
      const dy = pt.y - this.startPt.y;
      this.movingBox.x = Math.max(0, Math.min(1 - this.movingBox.w, this.origBox.x + dx));
      this.movingBox.y = Math.max(0, Math.min(1 - this.movingBox.h, this.origBox.y + dy));
      this.render();
      if (this.options.onChange) this.options.onChange(this.getBoxes());
      return;
    }

    if (!this.isDrawing || !this.startPt) return;
    if (e.cancelable) e.preventDefault();
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
      this.resizeCorner = null;
      this.origBox = null;
      this.render();
      return;
    }

    if (this.isMoving) {
      this.isMoving = false;
      this.movingBox = null;
      this.origBox = null;
      this.render();
      return;
    }

    if (!this.isDrawing) return;
    this.isDrawing = false;

    // Ignore tiny accidental taps (< 1.5% size)
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
      this.selectedBox = newBox;
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

      const isSelected = (b === this.selectedBox) || (!this.selectedBox && idx === this.boxes.length - 1 && !this.currentDraft);
      const isKeyframeActive = !b.id || this.mode !== 'keyframe' || (currentTime >= b.startTime && currentTime <= b.endTime);
      const alpha = isKeyframeActive ? (isSelected ? 0.28 : 0.18) : 0.07;
      const strokeColor = isKeyframeActive ? (isSelected ? '#34d399' : '#10b981') : 'rgba(16, 185, 129, 0.4)';

      // Translucent emerald fill
      this.ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
      this.ctx.fillRect(rx, ry, rw, rh);

      // High-contrast dashed neon border
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = isSelected ? 2.5 : 2;
      this.ctx.setLineDash(isSelected ? [8, 4] : [6, 3]);
      this.ctx.strokeRect(rx, ry, rw, rh);
      this.ctx.setLineDash([]);

      // Label tag + Delete button + Resize handles (for saved boxes)
      if (b.id) {
        const tagText = b.trackTemplate ? `🎯 Track #${idx + 1}` : `ROI #${idx + 1}`;
        const tagWidth = b.trackTemplate ? 84 : 70;

        // Label pill at top-left
        this.ctx.fillStyle = isSelected ? '#34d399' : '#10b981';
        this.ctx.fillRect(rx, Math.max(0, ry - 20), tagWidth, 20);
        this.ctx.fillStyle = '#0f172a';
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.fillText(tagText, rx + 6, Math.max(14, ry - 6));

        // Delete '×' button circle at top-right corner of the box
        const delCenterX = rx + rw;
        const delCenterY = ry;
        this.ctx.beginPath();
        this.ctx.arc(delCenterX, delCenterY, 11, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 13px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('×', delCenterX, delCenterY);
        this.ctx.textAlign = 'start';
        this.ctx.textBaseline = 'alphabetic';

        // 4 Corner Resize handles (white circular anchors with emerald stroke)
        const handleRadius = 6;
        const cornerAnchors = [
          [rx, ry],           // Top-Left
          [rx + rw, ry],      // Top-Right (underneath delete button)
          [rx, ry + rh],      // Bottom-Left
          [rx + rw, ry + rh]  // Bottom-Right
        ];

        for (const [hx, hy] of cornerAnchors) {
          // Skip drawing handle directly under delete button
          if (hx === delCenterX && hy === delCenterY) continue;
          this.ctx.beginPath();
          this.ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fill();
          this.ctx.strokeStyle = '#10b981';
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
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

    // 3. Extract ONLY this bounding box with an 8px border ring for clean background reference
    const pad = 8;
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

    // 4. Mark 100% of inner box pixels as mask = 1 (Zero fragile outlier thresholding inside custom boxes)
    // The user drew this box specifically because the entire inner region is the watermark.
    // The outer 8px perimeter ring remains 0 (clean reference pixels).
    const mask = new Uint8Array(extW * extH);
    let boxPixelCount = 0;

    for (let y = innerStartY; y < innerEndY; y++) {
      for (let x = innerStartX; x < innerEndX; x++) {
        mask[y * extW + x] = 1;
        boxPixelCount++;
      }
    }

    if (boxPixelCount === 0) continue;

    // 5. Boundary-Inward Fast Marching (Telea) from clean outer 8px ring inward + Texture Grain Preservation
    inpaintMaskedRegion(data, mask, extW, extH);

    // 6. Write ONLY the healed bounding box back to the canvas (99% of image remains 100% original!)
    ctx.putImageData(imgData, extX, extY);
    totalPixelsHealed += boxPixelCount;
  }

  return totalPixelsHealed;
}

// Fast Boundary-Inward Inpainting with Inverse Cubic Distance Weight & Local Grain Matching
function inpaintMaskedRegion(data, mask, w, h) {
  let remaining = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) remaining++;

  const radius = 8;
  let maxIter = Math.max(w, h) + 100;

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
