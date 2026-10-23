/**
 * GhostMeta AI - Comprehensive Automated E2E Verification Test Suite
 * Principal QA Automation & Media Systems Verification
 */

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { AIDetector } from '../js/detectors/ai-detector.js';
import { PNGCleaner } from '../js/cleaners/png-cleaner.js';
import { JPEGCleaner } from '../js/cleaners/jpeg-cleaner.js';
import { MP4Cleaner } from '../js/cleaners/mp4-cleaner.js';
import { WebPCleaner } from '../js/cleaners/webp-cleaner.js';
import { CleanerHub } from '../js/cleaners/cleaner-hub.js';

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

async function runBinaryUnitTests() {
  console.log('\n======================================================');
  console.log('PHASE 3 / PART 1: BINARY ENGINE SPECIFICATION CHECKS');
  console.log('======================================================');

  const pngPath = path.resolve('fixtures/test-comfyui-synthid.png');
  const jpgPath = path.resolve('fixtures/test-gps-c2pa.jpg');
  const mp4Path = path.resolve('fixtures/test-sora-runway-c2pa.mp4');

  const rawPng = new Uint8Array(fs.readFileSync(pngPath));
  const rawJpg = new Uint8Array(fs.readFileSync(jpgPath));
  const rawMp4 = new Uint8Array(fs.readFileSync(mp4Path));

  // 1. PNG Test
  console.log('\n[1/4] Testing PNG Binary Cleaning & Detection...');
  const pngFileObj = new File([rawPng], 'test-comfyui-synthid.png', { type: 'image/png' });
  const pngPreDetect = await AIDetector.detect(pngFileObj, rawPng);
  assert(pngPreDetect.hasAIMetadata === true, 'AIDetector identified AI metadata in raw PNG fixture');
  assert(pngPreDetect.rawFindings.some(f => f.includes('caBX') || f.includes('C2PA')), 'AIDetector found C2PA caBX chunk in PNG');
  assert(pngPreDetect.prompts.length > 0 || pngPreDetect.rawFindings.some(f => f.includes('workflow')), 'AIDetector found ComfyUI workflow');

  const cleanedPng = PNGCleaner.clean(rawPng);
  const cleanedPngStr = Buffer.from(cleanedPng).toString('latin1');
  assert(cleanedPng[0] === 0x89 && cleanedPng[1] === 0x50 && cleanedPng[2] === 0x4E && cleanedPng[3] === 0x47, 'Cleaned PNG has valid 8-byte PNG magic header');
  assert(!cleanedPngStr.includes('ComfyUI'), 'Cleaned PNG: "ComfyUI" string 100% absent');
  assert(!cleanedPngStr.includes('trainedAlgorithmicMedia'), 'Cleaned PNG: "trainedAlgorithmicMedia" string 100% absent');
  assert(!cleanedPngStr.includes('c2pa'), 'Cleaned PNG: "c2pa" string 100% absent');
  assert(!cleanedPngStr.includes('KSampler'), 'Cleaned PNG: "KSampler" node parameters 100% absent');

  // 2. JPEG Test
  console.log('\n[2/4] Testing JPEG Binary Cleaning & Detection...');
  const jpgFileObj = new File([rawJpg], 'test-gps-c2pa.jpg', { type: 'image/jpeg' });
  const jpgPreDetect = await AIDetector.detect(jpgFileObj, rawJpg);
  assert(jpgPreDetect.hasAIMetadata === true, 'AIDetector identified AI metadata in raw JPEG fixture');
  assert(jpgPreDetect.hasGPS === true, 'AIDetector identified GPS coordinates in raw JPEG fixture');

  const cleanedJpg = JPEGCleaner.clean(rawJpg);
  const cleanedJpgStr = Buffer.from(cleanedJpg).toString('latin1');
  assert(cleanedJpg[0] === 0xFF && cleanedJpg[1] === 0xD8, 'Cleaned JPEG has valid SOI (0xFFD8) header');
  assert(cleanedJpg[cleanedJpg.length - 2] === 0xFF && cleanedJpg[cleanedJpg.length - 1] === 0xD9, 'Cleaned JPEG has valid EOI (0xFFD9) terminator');
  assert(!cleanedJpgStr.includes('GPSLatitude'), 'Cleaned JPEG: "GPSLatitude" coordinates 100% absent');
  assert(!cleanedJpgStr.includes('c2pa'), 'Cleaned JPEG: "c2pa" JUMBF manifest 100% absent');
  assert(!cleanedJpgStr.includes('trainedAlgorithmicMedia'), 'Cleaned JPEG: "trainedAlgorithmicMedia" IPTC tag 100% absent');

  // 3. MP4 Test
  console.log('\n[3/4] Testing MP4 Video Binary In-Place Box Neutralization...');
  const mp4FileObj = new File([rawMp4], 'test-sora-runway-c2pa.mp4', { type: 'video/mp4' });
  const mp4PreDetect = await AIDetector.detect(mp4FileObj, rawMp4);
  assert(mp4PreDetect.hasAIMetadata === true, 'AIDetector identified AI metadata in raw MP4 fixture');
  assert(mp4PreDetect.rawFindings.some(f => f.includes('udta')), 'AIDetector found udta user data box');

  const cleanedMp4 = MP4Cleaner.clean(rawMp4);
  const cleanedMp4Buf = Buffer.from(cleanedMp4);
  const cleanedMp4Str = cleanedMp4Buf.toString('latin1');
  assert(cleanedMp4.length === rawMp4.length, 'Cleaned MP4 preserves exact byte length to prevent chunk offset desync');
  assert(!cleanedMp4Str.includes('c2pa'), 'Cleaned MP4: "c2pa" UUID manifest string 100% absent');
  assert(!cleanedMp4Str.includes('Sora'), 'Cleaned MP4: "Sora" AI model string 100% absent');
  assert(!cleanedMp4Str.includes('Runway'), 'Cleaned MP4: "Runway" AI model string 100% absent');
  assert(cleanedMp4Str.includes('free'), 'Cleaned MP4: metadata boxes replaced in-place with standard "free" atoms');

  // 4. WebP Test (LE Header Recalculation & VP8X Flag Clearing)
  console.log('\n[4/4] Testing WebP RIFF Size Recalculation & VP8X Flag Clearing...');
  // Build a synthetic WebP with VP8X, EXIF, and XMP chunks
  const riffHeader = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'ascii');
  // VP8X chunk: 10 bytes payload. Flags at byte 0. Bit 3 = EXIF (0x08), Bit 2 = XMP (0x04)
  const vp8xPayload = Buffer.from([0x0C, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00]); // flags = 0x0C (EXIF+XMP)
  const vp8xChunk = Buffer.alloc(18);
  vp8xChunk.write('VP8X', 0, 4, 'ascii');
  vp8xChunk.writeUInt32LE(10, 4);
  vp8xPayload.copy(vp8xChunk, 8);

  const exifPayload = Buffer.from('EXIF data with GPS and camera info');
  const exifChunk = Buffer.alloc(8 + exifPayload.length + (exifPayload.length % 2));
  exifChunk.write('EXIF', 0, 4, 'ascii');
  exifChunk.writeUInt32LE(exifPayload.length, 4);
  exifPayload.copy(exifChunk, 8);

  const xmpPayload = Buffer.from('XMP data with trainedAlgorithmicMedia');
  const xmpChunk = Buffer.alloc(8 + xmpPayload.length + (xmpPayload.length % 2));
  xmpChunk.write('XMP ', 0, 4, 'ascii');
  xmpChunk.writeUInt32LE(xmpPayload.length, 4);
  xmpPayload.copy(xmpChunk, 8);

  const webpBuffer = Buffer.concat([riffHeader, vp8xChunk, exifChunk, xmpChunk]);
  // Set initial RIFF size
  webpBuffer.writeUInt32LE(webpBuffer.length - 8, 4);

  const cleanedWebp = WebPCleaner.clean(webpBuffer);
  const cleanedWebpBuf = Buffer.from(cleanedWebp);
  const cleanedWebpView = new DataView(cleanedWebp.buffer, cleanedWebp.byteOffset, cleanedWebp.byteLength);

  const expectedRiffSize = cleanedWebp.byteLength - 8;
  const actualRiffSize = cleanedWebpView.getUint32(4, true);
  assert(actualRiffSize === expectedRiffSize, `Cleaned WebP RIFF header size correctly updated (${actualRiffSize} === ${expectedRiffSize})`);

  // Check VP8X flag: byte 20 must have bit 2 (XMP) and bit 3 (EXIF) cleared to 0
  const vp8xFlags = cleanedWebpBuf[20];
  assert((vp8xFlags & 0x08) === 0, 'Cleaned WebP VP8X EXIF flag (bit 3) cleared to 0');
  assert((vp8xFlags & 0x04) === 0, 'Cleaned WebP VP8X XMP flag (bit 2) cleared to 0');
  assert(!cleanedWebpBuf.toString('latin1').includes('EXIF data'), 'Cleaned WebP: EXIF chunk completely removed');
  assert(!cleanedWebpBuf.toString('latin1').includes('XMP data'), 'Cleaned WebP: XMP chunk completely removed');

  // 5. Deep Scrub Video Graceful Fallback Test
  console.log('\n[5/5] Testing Deep Scrub Video Fallback Handling in CleanerHub...');
  const hubResult = await CleanerHub.processFile(mp4FileObj, { scrubMode: 'deep' });
  assert(hubResult.cleaningMethod === 'lossless-video-fallback', 'CleanerHub gracefully routed MP4 video in Deep Scrub mode to "lossless-video-fallback"');
  assert(hubResult.cleanedBlob.size === mp4FileObj.size, 'Video fallback preserved byte size');
}

async function runBrowserPlaywrightTests() {
  console.log('\n======================================================');
  console.log('PHASE 4: REAL BROWSER PLAYWRIGHT E2E AUTOMATION');
  console.log('======================================================');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true
  });

  const page = await context.newPage();

  // Monitor all network requests to verify 100% Client-Side operation
  const networkRequests = [];
  page.on('request', req => {
    networkRequests.push({
      method: req.method(),
      url: req.url()
    });
  });

  page.on('console', msg => console.log('  [BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('  [BROWSER ERROR]', err.message));

  // Disable showSaveFilePicker in automated test so browser standard download event fires
  await page.addInitScript(() => {
    delete window.showSaveFilePicker;
  });

  console.log('\n[Test 1] Loading GhostMeta AI on http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  const title = await page.title();
  assert(title.includes('GhostMeta AI'), `Page title is correct ("${title}")`);

  // 1. Cross-Platform Paste Shortcut Check
  console.log('\n[Test 2] Verifying Cross-Platform Paste Shortcut...');
  const pasteHintText = await page.textContent('#pasteHint');
  assert(pasteHintText === 'Ctrl+V' || pasteHintText === '⌘+V', `Paste hint dynamically displayed as: ${pasteHintText}`);

  // 2. Header Brand Link Smooth Scroll Check
  console.log('\n[Test 3] Verifying Header Brand Link Behavior...');
  const initialUrl = page.url();
  await page.click('.brand');
  await page.waitForTimeout(100);
  assert(!page.url().includes('#'), 'Clicking brand logo does not append "#" to the URL');

  // 3. Dropzone Sample Button Event Bubbling Check
  console.log('\n[Test 4] Verifying Sample Button Click Bubbling...');
  // Check that clicking a sample preset does not trigger fileInput
  let fileDialogTriggered = false;
  page.once('filechooser', () => { fileDialogTriggered = true; });

  await page.click('#sampleSdBtn');
  await page.waitForTimeout(600); // Wait for sample file creation and queue prepend
  assert(fileDialogTriggered === false, 'Clicking sample preset button did NOT trigger OS file upload dialog');

  const queueCountText = await page.textContent('#queueCount');
  assert(queueCountText.includes('1 file(s) in queue'), 'Sample preset added file to queue');

  // 4. Modal Accessibility & Keyboard Navigation (Escape key) Check
  console.log('\n[Test 5] Verifying Metadata Radar Modal Accessibility & Escape Key...');
  // Inspect the sample item
  const inspectBtn = await page.waitForSelector('.btn-icon[id^="inspectBtn-"]');
  await inspectBtn.click();
  await page.waitForTimeout(300);

  const modal = await page.locator('#inspectorModal');
  const isModalOpen = await modal.evaluate(el => el.classList.contains('open'));
  assert(isModalOpen === true, 'Inspector modal opened on Inspect button click');

  const ariaModal = await modal.getAttribute('aria-modal');
  const role = await modal.getAttribute('role');
  const ariaLabelledby = await modal.getAttribute('aria-labelledby');
  assert(ariaModal === 'true', 'Inspector modal has aria-modal="true"');
  assert(role === 'dialog', 'Inspector modal has role="dialog"');
  assert(ariaLabelledby === 'modalTitle', 'Inspector modal has aria-labelledby="modalTitle"');

  // Tab switching
  console.log('Testing Radar modal tab switching...');
  await page.click('.tab-btn[data-tab="prompts"]');
  const promptsDisplay = await page.locator('#tabPrompts').evaluate(el => el.style.display);
  assert(promptsDisplay === 'block', 'Prompts tab displayed on click');

  await page.click('.tab-btn[data-tab="diff"]');
  const diffDisplay = await page.locator('#tabDiff').evaluate(el => el.style.display);
  assert(diffDisplay === 'block', 'Diff tab displayed on click');

  // Test Escape key closes modal
  console.log('Testing Escape key to dismiss modal...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const isModalClosed = await modal.evaluate(el => !el.classList.contains('open'));
  assert(isModalClosed === true, 'Inspector modal closed cleanly on Escape key press');

  // Clear queue
  await page.click('#clearQueueBtn');
  await page.waitForTimeout(200);

  // 5. Test Mobile QR Modal & Escape Key
  console.log('\n[Test 6] Verifying Mobile Connect Modal & Escape Key...');
  await page.click('#mobileConnectBtn');
  await page.waitForTimeout(300);
  const mobileModal = await page.locator('#mobileModal');
  const isMobileModalOpen = await mobileModal.evaluate(el => el.classList.contains('open'));
  assert(isMobileModalOpen === true, 'Mobile Connect modal opened');
  assert(await mobileModal.getAttribute('aria-modal') === 'true', 'Mobile modal has aria-modal="true"');
  assert(await mobileModal.getAttribute('role') === 'dialog', 'Mobile modal has role="dialog"');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const isMobileModalClosed = await mobileModal.evaluate(el => !el.classList.contains('open'));
  assert(isMobileModalClosed === true, 'Mobile Connect modal closed cleanly on Escape key press');

  // 6. Upload 3 Custom Binary Test Fixtures
  console.log('\n[Test 7] Uploading In-Memory Binary Test Fixtures...');
  const pngPath = path.resolve('fixtures/test-comfyui-synthid.png');
  const jpgPath = path.resolve('fixtures/test-gps-c2pa.jpg');
  const mp4Path = path.resolve('fixtures/test-sora-runway-c2pa.mp4');

  const fileInput = await page.locator('#fileInput');
  await fileInput.setInputFiles([pngPath, jpgPath, mp4Path]);
  await page.waitForTimeout(600);

  const cardsCount = await page.locator('.file-card').count();
  assert(cardsCount === 3, `Uploaded 3 test fixtures successfully (Found ${cardsCount} cards in queue)`);

  // 7. Toggle Deep Scrub Mode & Verify Video Graceful Fallback
  console.log('\n[Test 8] Testing Deep Scrub Mode with Video Fallback Badge...');
  await page.click('#modeDeep');
  const isDeepSelected = await page.locator('#modeDeep').evaluate(el => el.classList.contains('selected'));
  assert(isDeepSelected === true, 'Switched to Deep Scrub & Anti-SynthID mode');

  // Find MP4 card clean button
  const mp4Card = page.locator('.file-card', { hasText: 'test-sora-runway-c2pa.mp4' });
  const mp4CleanBtn = mp4Card.locator('.btn-primary');
  await mp4CleanBtn.click();
  await page.waitForTimeout(800);

  const mp4BadgeText = await mp4Card.locator('.badge-ai-threat').textContent();
  assert(mp4BadgeText.includes('Lossless (Video Preserved)'), `Video in Deep Scrub gracefully shows fallback badge: "${mp4BadgeText.trim()}"`);

  // 8. Clean Remaining Files & Download
  console.log('\n[Test 9] Cleaning All Files and Verifying Client-Side Downloads...');
  await page.click('#cleanAllBtn');
  // Wait until cleanAllBtn is re-enabled (processAllPending finished)
  await page.waitForFunction(() => {
    const btn = document.getElementById('cleanAllBtn');
    return btn && !btn.disabled;
  }, { timeout: 15000 });
  await page.waitForTimeout(500);

  // Check card statuses
  const allCards = await page.locator('.file-card').all();
  for (const c of allCards) {
    const text = await c.locator('.badge-ai-threat').textContent();
    console.log(`  [Card Badge] ${text.trim().replace(/\s+/g, ' ')}`);
  }

  const cleanedBadges = await page.locator('.badge-threat-clean').count();
  assert(cleanedBadges === 3, `All 3 uploaded files successfully cleaned (found ${cleanedBadges} clean badges)`);

  // 9. Download Single Cleaned File & Verify Binary Contents
  console.log('\n[Test 10] Testing Single File Download & Binary Metadata Absence...');
  const pngCard = page.locator('.file-card', { hasText: 'test-comfyui-synthid.png' });
  const downloadPromise = page.waitForEvent('download');
  await pngCard.locator('.btn-download-item').click();
  const download = await downloadPromise;
  const downloadedPath = path.resolve('fixtures/downloaded_test_png.png');
  await download.saveAs(downloadedPath);

  const downloadedBytes = fs.readFileSync(downloadedPath);
  const downloadedStr = downloadedBytes.toString('latin1');
  assert(downloadedBytes.length > 0, 'Downloaded cleaned PNG is not empty');
  assert(!downloadedStr.includes('ComfyUI'), 'Downloaded PNG: "ComfyUI" 100% absent');
  assert(!downloadedStr.includes('trainedAlgorithmicMedia'), 'Downloaded PNG: "trainedAlgorithmicMedia" 100% absent');
  assert(!downloadedStr.includes('c2pa'), 'Downloaded PNG: "c2pa" 100% absent');

  // 10. Verify 100% Client-Side Privacy (ZERO POST/PUT Requests)
  console.log('\n[Test 11] Verifying 100% Client-Side Privacy (Zero POST / PUT Requests)...');
  const mutationRequests = networkRequests.filter(r => r.method === 'POST' || r.method === 'PUT');
  console.log(`Total network requests recorded: ${networkRequests.length}`);
  console.log(`POST/PUT network requests recorded: ${mutationRequests.length}`);
  if (mutationRequests.length > 0) {
    console.error('Violating requests:', mutationRequests);
  }
  assert(mutationRequests.length === 0, 'ZERO external network requests (POST/PUT) occurred during file processing & download');

  await browser.close();
}

async function main() {
  try {
    await runBinaryUnitTests();
    await runBrowserPlaywrightTests();

    console.log('\n======================================================');
    console.log(`🎉 ALL ${passedChecks}/${totalChecks} TESTS PASSED SUCCESSFULLY!`);
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    process.exit(1);
  }
}

main();
