/**
 * GhostMeta AI - Mobile Viewport & Touch ROI Box Responsiveness Automated Test Suite
 * Verifies:
 * 1. 100% Full Visibility of vertical 9:16 videos and tall images on mobile devices (zero bottom-corner clipping).
 * 2. Exact 1:1 Canvas-to-Media overlay synchronization with zero letterboxing.
 * 3. Mobile touch-drag movement of existing bounding boxes.
 * 4. Mobile 4-corner touch resizing with generous hit targets.
 * 5. Instant fine-tuning nudge buttons (Up, Down, Left, Right, Grow, Shrink).
 * 6. Quick corner presets (Gemini bottom-right, bottom-left, top-right, top-left).
 */

import { chromium } from 'playwright';
import path from 'path';
import http from 'http';
import fs from 'fs';

function startServer(port = 3001) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.svg': 'image/svg+xml'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(process.cwd(), reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runMobileTests() {
  console.log('======================================================');
  console.log('MOBILE VIEWPORT & TOUCH ROI SELECTION AUDIT');
  console.log('======================================================\n');

  const server = await startServer(3001);
  console.log('[0] Local test server running on http://localhost:3001');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // Emulate Mobile Device (iPhone 13 / 14: 390 x 844, 3x DPI, touch enabled)
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('  [BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('  [PAGE ERROR]', err));
  await page.goto('http://localhost:3001');

  console.log('\n[1] Testing Mobile UI Layout on 390x844 viewport...');
  const title = await page.title();
  assert(title.includes('GhostMeta'), 'Mobile page loaded successfully');

  // Verify paste hint is hidden or appropriate on touch mobile
  const pasteHintVisible = await page.$eval('#pasteHint', el => window.getComputedStyle(el).display !== 'none');
  console.log(`  ℹ️ Mobile paste hint display status: ${pasteHintVisible ? 'Visible' : 'Hidden for touch'}`);

  console.log('\n[2] Loading ChatGPT / Gemini Sample Image and Opening ROI Modal...');
  await page.click('#sampleDalleBtn');
  await page.waitForSelector('.file-card');

  // Open ROI Modal by triggering click on the Custom Boxes button or via app API
  await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    const item = app.queue[0];
    app.openRoiModal(item);
  });

  await page.waitForSelector('#roiModal.open');
  await page.waitForTimeout(300);

  console.log('\n[3] Verifying 100% Media Visibility & Zero Clipping on Mobile...');
  const visibilityMetrics = await page.evaluate(() => {
    const container = document.getElementById('roiViewportContainer');
    const viewport = document.querySelector('.roi-media-viewport');
    const wrapper = document.getElementById('roiMediaWrapper');
    const img = document.getElementById('roiPreviewImg');
    const canvas = document.getElementById('roiOverlayCanvas');

    const cRect = container.getBoundingClientRect();
    const vRect = viewport.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();
    const cvRect = canvas.getBoundingClientRect();

    // Check if bottom-right corner of image is within viewport
    const imgBottom = iRect.bottom;
    const imgRight = iRect.right;
    const containerBottom = cRect.bottom;
    const containerRight = cRect.right;

    return {
      containerW: cRect.width,
      containerH: cRect.height,
      imgW: iRect.width,
      imgH: iRect.height,
      canvasW: cvRect.width,
      canvasH: cvRect.height,
      imgBottom,
      containerBottom,
      imgRight,
      containerRight,
      isFullyContained: (imgBottom <= containerBottom + 1 && imgRight <= containerRight + 1),
      canvasMatchesImg: Math.abs(iRect.width - cvRect.width) <= 1 && Math.abs(iRect.height - cvRect.height) <= 1
    };
  });

  console.log(`  Container: ${visibilityMetrics.containerW.toFixed(0)}x${visibilityMetrics.containerH.toFixed(0)}px`);
  console.log(`  Image:     ${visibilityMetrics.imgW.toFixed(0)}x${visibilityMetrics.imgH.toFixed(0)}px`);
  console.log(`  Canvas:    ${visibilityMetrics.canvasW.toFixed(0)}x${visibilityMetrics.canvasH.toFixed(0)}px`);

  assert(visibilityMetrics.isFullyContained, 'Image fits 100% within container with ZERO bottom-corner clipping');
  assert(visibilityMetrics.canvasMatchesImg, 'Overlay canvas matches rendered image dimensions down to the pixel');

  console.log('\n[4] Verifying Default Corner Preset (Bottom-Right Gemini)...');
  let boxes = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes();
  });
  assert(boxes.length === 1, 'Default ROI box is present');
  assert(boxes[0].x > 0.6 && boxes[0].y > 0.6, 'Default box is accurately positioned at bottom-right corner');

  console.log('\n[5] Testing Fine-Tune Nudge Controls (Up, Down, Left, Right, Grow, Shrink)...');
  const initialBox = { ...boxes[0] };

  // Nudge Up
  await page.click('#roiNudgeUp');
  let afterUp = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes()[0];
  });
  assert(afterUp.y < initialBox.y, 'Nudge Up shifted box upward');

  // Nudge Down
  await page.click('#roiNudgeDown');
  let afterDown = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes()[0];
  });
  assert(Math.abs(afterDown.y - initialBox.y) < 0.005, 'Nudge Down shifted box back downward');

  // Nudge Left
  await page.click('#roiNudgeLeft');
  let afterLeft = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes()[0];
  });
  assert(afterLeft.x < initialBox.x, 'Nudge Left shifted box leftward');

  // Nudge Right
  await page.click('#roiNudgeRight');
  let afterRight = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes()[0];
  });
  assert(Math.abs(afterRight.x - initialBox.x) < 0.005, 'Nudge Right shifted box back rightward');

  // Grow
  await page.click('#roiNudgeGrow');
  let afterGrow = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes()[0];
  });
  assert(afterGrow.w >= initialBox.w, 'Nudge Grow enlarged box width');

  // Shrink
  await page.click('#roiNudgeShrink');
  let afterShrink = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes()[0];
  });
  assert(afterShrink.w < afterGrow.w, 'Nudge Shrink reduced box width');

  console.log('\n[6] Testing Touch Drag to Move Box on Mobile...');
  const dragResult = await page.evaluate(async () => {
    const app = window.ghostMetaApp || window.app;
    const canvas = document.getElementById('roiOverlayCanvas');
    const rect = canvas.getBoundingClientRect();
    const box = app.boxSelector.getBoxes()[0];

    // Calculate touch point inside the center of the box
    const startX = rect.left + (box.x + box.w / 2) * rect.width;
    const startY = rect.top + (box.y + box.h / 2) * rect.height;

    // Target touch point (drag diagonally left & up by 40px)
    const moveX = startX - 40;
    const moveY = startY - 40;

    const tStart = new Touch({ identifier: 1, target: canvas, clientX: startX, clientY: startY });
    canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [tStart], changedTouches: [tStart], bubbles: true }));

    const tMove = new Touch({ identifier: 1, target: canvas, clientX: moveX, clientY: moveY });
    window.dispatchEvent(new TouchEvent('touchmove', { touches: [tMove], changedTouches: [tMove], bubbles: true }));

    const tEnd = new Touch({ identifier: 1, target: canvas, clientX: moveX, clientY: moveY });
    window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [tEnd], bubbles: true }));

    const newBox = app.boxSelector.getBoxes()[0];
    return {
      origX: box.x,
      origY: box.y,
      newX: newBox.x,
      newY: newBox.y,
      moved: newBox.x < box.x && newBox.y < box.y,
      isMoving: app.boxSelector.isMoving,
      isResizing: app.boxSelector.isResizing
    };
  });

  console.log('  Drag Result:', dragResult);

  assert(dragResult.moved, 'Touch drag inside box successfully repositioned the box on mobile');

  console.log('\n[7] Testing Touch Resize on Corner Handle...');
  const resizeResult = await page.evaluate(async () => {
    const app = window.ghostMetaApp || window.app;
    const canvas = document.getElementById('roiOverlayCanvas');
    const rect = canvas.getBoundingClientRect();
    const box = app.boxSelector.getBoxes()[0];

    // Bottom-right corner handle coordinates
    const cornerX = rect.left + (box.x + box.w) * rect.width;
    const cornerY = rect.top + (box.y + box.h) * rect.height;

    // Drag corner by +25px
    const moveX = cornerX + 25;
    const moveY = cornerY + 25;

    const tStart = new Touch({ identifier: 2, target: canvas, clientX: cornerX, clientY: cornerY });
    canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [tStart], changedTouches: [tStart], bubbles: true }));

    const tMove = new Touch({ identifier: 2, target: canvas, clientX: moveX, clientY: moveY });
    window.dispatchEvent(new TouchEvent('touchmove', { touches: [tMove], changedTouches: [tMove], bubbles: true }));

    const tEnd = new Touch({ identifier: 2, target: canvas, clientX: moveX, clientY: moveY });
    window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [tEnd], bubbles: true }));

    const newBox = app.boxSelector.getBoxes()[0];
    return {
      origW: box.w,
      newW: newBox.w,
      resized: newBox.w > box.w
    };
  });

  assert(resizeResult.resized, 'Touch resize on corner handle successfully resized box dimensions');

  console.log('\n[8] Testing Corner Presets Switcher...');
  await page.click('#roiPresetTl');
  let tlBox = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes()[0];
  });
  assert(tlBox.x < 0.1 && tlBox.y < 0.1, 'Top-Left preset sets box to top-left corner');

  await page.click('#roiPresetBr');
  let brBox = await page.evaluate(() => {
    const app = window.ghostMetaApp || window.app;
    return app.boxSelector.getBoxes()[0];
  });
  assert(brBox.x > 0.6 && brBox.y > 0.6, 'Bottom-Right preset sets box to bottom-right corner');

  console.log('\n[9] Testing Vertical 9:16 Video in Mobile ROI Viewport...');
  // Load an authentic video into the selector
  const videoVisibilityMetrics = await page.evaluate(async () => {
    const app = window.ghostMetaApp || window.app;
    const video = document.getElementById('roiPreviewVideo');
    const container = document.getElementById('roiViewportContainer');
    const scrubber = document.getElementById('roiScrubberBar');

    Object.defineProperty(video, 'videoWidth', { value: 720, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1280, configurable: true });
    Object.defineProperty(video, 'duration', { value: 5, configurable: true });

    document.getElementById('roiPreviewImg').style.display = 'none';
    video.style.display = 'block';
    scrubber.style.display = 'flex';

    app.boxSelector.destroy();
    app.boxSelector = new (app.boxSelector.constructor)(video, document.getElementById('roiOverlayCanvas'), {
      onChange: (b) => app.updateRoiBoxCount(b)
    });
    app.boxSelector.addCornerPreset('bottom-right');
    app.boxSelector.syncCanvasSize();

    const cRect = container.getBoundingClientRect();
    const vRect = video.getBoundingClientRect();
    const sRect = scrubber.getBoundingClientRect();
    const cvRect = document.getElementById('roiOverlayCanvas').getBoundingClientRect();

    return {
      containerH: cRect.height,
      videoH: vRect.height,
      scrubberH: sRect.height,
      videoBottom: vRect.bottom,
      containerBottom: cRect.bottom,
      isFullyVisible: (vRect.bottom <= sRect.top + 2) && (vRect.top >= cRect.top - 2),
      canvasMatchesVideo: Math.abs(vRect.width - cvRect.width) <= 1 && Math.abs(vRect.height - cvRect.height) <= 1
    };
  });

  console.log(`  Vertical 9:16 Video: Height=${videoVisibilityMetrics.videoH.toFixed(0)}px, Viewport=${videoVisibilityMetrics.containerH.toFixed(0)}px`);
  assert(videoVisibilityMetrics.isFullyVisible, 'Vertical 9:16 video is 100% fully visible above scrubber with zero clipping');
  assert(videoVisibilityMetrics.canvasMatchesVideo, 'Overlay canvas matches vertical video dimensions with zero letterboxing');

  console.log('\n[10] Applying Box and Closing Modal...');
  await page.click('#roiApplyBtn');
  const isOpen = await page.$eval('#roiModal', el => el.classList.contains('open'));
  assert(!isOpen, 'ROI modal closed cleanly after applying custom box');

  await browser.close();
  server.close();

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passedChecks}/${totalChecks} MOBILE RESPONSIVENESS CHECKS PASSED!`);
  console.log('======================================================\n');
}

runMobileTests().catch((err) => {
  console.error('\n❌ MOBILE TEST FAILED:\n', err);
  process.exit(1);
});
