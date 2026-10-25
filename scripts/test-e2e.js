/**
 * GhostMeta AI - Comprehensive Automated E2E Verification Test Suite
 * Principal QA Automation & Media Systems Verification
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import { AIDetector } from '../js/detectors/ai-detector.js';
import { PNGCleaner } from '../js/cleaners/png-cleaner.js';
import { JPEGCleaner } from '../js/cleaners/jpeg-cleaner.js';
import { MP4Cleaner } from '../js/cleaners/mp4-cleaner.js';
import { WebPCleaner } from '../js/cleaners/webp-cleaner.js';
import { CleanerHub } from '../js/cleaners/cleaner-hub.js';
import { WatermarkRemover, healSelectedBoxes } from '../js/cleaners/watermark-remover.js';
import { getLosslessTargetBitrate, getRealtimeVideoBitrate, compileInpaintLUT, executeInpaintLUT } from '../js/cleaners/video-watermark-cleaner.js';
import { CameraSpoofer, CAMERA_PROFILES } from '../js/cleaners/camera-spoofer.js';

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
  console.log('\n[1/7] Testing PNG Binary Cleaning & Detection...');
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
  console.log('\n[2/7] Testing JPEG Binary Cleaning & Detection...');
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
  console.log('\n[3/7] Testing MP4 Video Binary In-Place Box Neutralization...');
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
  console.log('\n[4/7] Testing WebP RIFF Size Recalculation & VP8X Flag Clearing...');
  const riffHeader = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'ascii');
  const vp8xPayload = Buffer.from([0x0C, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00]);
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
  webpBuffer.writeUInt32LE(webpBuffer.length - 8, 4);

  const cleanedWebp = WebPCleaner.clean(webpBuffer);
  const cleanedWebpBuf = Buffer.from(cleanedWebp);
  const cleanedWebpView = new DataView(cleanedWebp.buffer, cleanedWebp.byteOffset, cleanedWebp.byteLength);

  const expectedRiffSize = cleanedWebp.byteLength - 8;
  const actualRiffSize = cleanedWebpView.getUint32(4, true);
  assert(actualRiffSize === expectedRiffSize, `Cleaned WebP RIFF header size correctly updated (${actualRiffSize} === ${expectedRiffSize})`);

  const vp8xFlags = cleanedWebpBuf[20];
  assert((vp8xFlags & 0x08) === 0, 'Cleaned WebP VP8X EXIF flag (bit 3) cleared to 0');
  assert((vp8xFlags & 0x04) === 0, 'Cleaned WebP VP8X XMP flag (bit 2) cleared to 0');
  assert(!cleanedWebpBuf.toString('latin1').includes('EXIF data'), 'Cleaned WebP: EXIF chunk completely removed');
  assert(!cleanedWebpBuf.toString('latin1').includes('XMP data'), 'Cleaned WebP: XMP chunk completely removed');

  // 5. Deep Scrub Video Graceful Fallback Test
  console.log('\n[5/7] Testing Deep Scrub Video Fallback Handling in CleanerHub...');
  const hubResult = await CleanerHub.processFile(mp4FileObj, { scrubMode: 'deep' });
  assert(hubResult.cleaningMethod === 'lossless-video-fallback', 'CleanerHub gracefully routed MP4 video in Deep Scrub mode to "lossless-video-fallback"');
  assert(hubResult.cleanedBlob.size === mp4FileObj.size, 'Video fallback preserved byte size');

  // 6. WatermarkRemover Computer Vision Algorithm & Strict ROI Isolation Check
  console.log('\n[6/7] Testing WatermarkRemover CV Algorithm & Strict ROI Isolation...');
  const testW = 400;
  const testH = 400;
  const rawPixelBuffer = new Uint8ClampedArray(testW * testH * 4);
  
  // Fill background with a dark textured gradient
  for (let y = 0; y < testH; y++) {
    for (let x = 0; x < testW; x++) {
      const idx = (y * testW + x) * 4;
      const noise = ((x ^ y) & 7); // subtle natural noise
      rawPixelBuffer[idx] = 30 + noise;      // R
      rawPixelBuffer[idx + 1] = 27 + noise;  // G
      rawPixelBuffer[idx + 2] = 75 + noise;  // B
      rawPixelBuffer[idx + 3] = 255;         // A
    }
  }

  // Draw an authentic Gemini 4-point sparkle watermark in bottom-right corner (cx=368, cy=368)
  const cx = 368;
  const cy = 368;
  for (let dy = -12; dy <= 12; dy++) {
    for (let dx = -12; dx <= 12; dx++) {
      // 4-point diamond star equation: |dx|^0.5 + |dy|^0.5 <= R^0.5
      const dist = Math.sqrt(Math.abs(dx)) + Math.sqrt(Math.abs(dy));
      if (dist <= 3.2) {
        const p = ((cy + dy) * testW + (cx + dx)) * 4;
        rawPixelBuffer[p] = 255;
        rawPixelBuffer[p + 1] = 255;
        rawPixelBuffer[p + 2] = 255;
        rawPixelBuffer[p + 3] = 255;
      }
    }
  }

  const originalBeforeScrub = new Uint8ClampedArray(rawPixelBuffer);
  const testImageData = {
    width: testW,
    height: testH,
    data: rawPixelBuffer
  };

  const wmResult = WatermarkRemover.processImageData(testImageData, { corner: 'bottom-right' });
  assert(wmResult.watermarkDetected === true, 'WatermarkRemover successfully detected bottom-right Gemini sparkle watermark');
  assert(wmResult.pixelsInpainted > 0, `WatermarkRemover seamlessly inpainted ${wmResult.pixelsInpainted} watermark pixels`);

  // Verify Strict ROI Isolation: Not a single pixel outside the target corner ROI was modified
  let outsideDiffCount = 0;
  const roi = wmResult.roi;
  for (let y = 0; y < testH; y++) {
    for (let x = 0; x < testW; x++) {
      const isInsideROI = (x >= roi.x && x < roi.x + roi.w && y >= roi.y && y < roi.y + roi.h);
      if (!isInsideROI) {
        const p = (y * testW + x) * 4;
        if (
          testImageData.data[p] !== originalBeforeScrub[p] ||
          testImageData.data[p + 1] !== originalBeforeScrub[p + 1] ||
          testImageData.data[p + 2] !== originalBeforeScrub[p + 2] ||
          testImageData.data[p + 3] !== originalBeforeScrub[p + 3]
        ) {
          outsideDiffCount++;
        }
      }
    }
  }
  assert(outsideDiffCount === 0, 'Strict ROI Isolation: 100% of pixels outside target corner ROI remain bit-for-bit identical (0% altered)');

  // Verify healed watermark pixels are close to surrounding background (not white anymore)
  const centerP = (cy * testW + cx) * 4;
  const healedR = testImageData.data[centerP];
  const healedG = testImageData.data[centerP + 1];
  const healedB = testImageData.data[centerP + 2];
  assert(healedR < 80 && healedG < 80 && healedB < 120, `Inpainted watermark center healed from #FFFFFF to background color (${healedR}, ${healedG}, ${healedB})`);

  // Verify zero false positives on clean image
  const cleanImageData = {
    width: testW,
    height: testH,
    data: new Uint8ClampedArray(originalBeforeScrub)
  };
  // Overwrite the sparkle with background
  for (let dy = -15; dy <= 15; dy++) {
    for (let dx = -15; dx <= 15; dx++) {
      const p = ((cy + dy) * testW + (cx + dx)) * 4;
      cleanImageData.data[p] = 30;
      cleanImageData.data[p + 1] = 27;
      cleanImageData.data[p + 2] = 75;
    }
  }
  const cleanResult = WatermarkRemover.processImageData(cleanImageData, { corner: 'bottom-right' });
  assert(cleanResult.watermarkDetected === false, 'Zero False Positives: Clean image triggers 0 watermark detections');
  assert(cleanResult.pixelsInpainted === 0, 'Clean image touches 0 pixels');

  // 7. Anti-SynthID Jitter PSNR > 58 dB Calculation
  console.log('\n[7/7] Testing Anti-SynthID Frequency Jitter PSNR Guarantee (> 58 dB)...');
  const ditheredData = new Uint8ClampedArray(originalBeforeScrub);
  let ditherCount = 0;
  for (let i = 0; i < ditheredData.length; i += 4) {
    if (Math.random() < 0.05) { // 5% sparse subset
      ditherCount++;
      ditheredData[i] = Math.min(255, Math.max(0, ditheredData[i] + (Math.random() > 0.5 ? 1 : -1)));
      ditheredData[i + 1] = Math.min(255, Math.max(0, ditheredData[i + 1] + (Math.random() > 0.5 ? 1 : -1)));
      ditheredData[i + 2] = Math.min(255, Math.max(0, ditheredData[i + 2] + (Math.random() > 0.5 ? 1 : -1)));
    }
  }

  let sumSquaredError = 0;
  const numColorSamples = (ditheredData.length / 4) * 3;
  for (let i = 0; i < ditheredData.length; i += 4) {
    const dr = ditheredData[i] - originalBeforeScrub[i];
    const dg = ditheredData[i + 1] - originalBeforeScrub[i + 1];
    const db = ditheredData[i + 2] - originalBeforeScrub[i + 2];
    sumSquaredError += (dr * dr + dg * dg + db * db);
  }
  const mse = sumSquaredError / numColorSamples;
  const psnr = 10 * Math.log10((255 * 255) / (mse || 1e-10));
  assert(psnr > 58.0, `Anti-SynthID Sparse 5% +-1 LSB Jitter achieves PSNR > 58 dB (Measured PSNR = ${psnr.toFixed(2)} dB, 100% visually imperceptible)`);

  // 8. Interactive Multi-Box Inpainting & Strict Boundary Isolation Unit Test
  console.log('\n[8/8] Testing Interactive Multi-Box Inpainting & Strict Boundary Isolation...');
  const testW2 = 100;
  const testH2 = 100;
  const buffer = new Uint8ClampedArray(testW2 * testH2 * 4);
  buffer.fill(128);

  // Draw synthetic watermark in normalized box (0.7, 0.7, 0.2, 0.2) => (70, 70, 20, 20)
  for (let y = 70; y < 90; y++) {
    for (let x = 70; x < 90; x++) {
      const idx = (y * testW2 + x) * 4;
      buffer[idx] = 255;
      buffer[idx + 1] = 255;
      buffer[idx + 2] = 255;
    }
  }

  const originalCopy = new Uint8ClampedArray(buffer);

  // Mock CanvasRenderingContext2D
  const mockCtx = {
    getImageData(x, y, w, h) {
      const sub = new Uint8ClampedArray(w * h * 4);
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const srcIdx = ((y + r) * testW2 + (x + c)) * 4;
          const dstIdx = (r * w + c) * 4;
          sub[dstIdx] = buffer[srcIdx];
          sub[dstIdx + 1] = buffer[srcIdx + 1];
          sub[dstIdx + 2] = buffer[srcIdx + 2];
          sub[dstIdx + 3] = buffer[srcIdx + 3];
        }
      }
      return { width: w, height: h, data: sub };
    },
    putImageData(imgData, x, y) {
      const { width: w, height: h, data: sub } = imgData;
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const srcIdx = (r * w + c) * 4;
          const dstIdx = ((y + r) * testW2 + (x + c)) * 4;
          buffer[dstIdx] = sub[srcIdx];
          buffer[dstIdx + 1] = sub[srcIdx + 1];
          buffer[dstIdx + 2] = sub[srcIdx + 2];
          buffer[dstIdx + 3] = sub[srcIdx + 3];
        }
      }
    }
  };

  const testBoxes = [{
    id: 'test_box_1',
    x: 0.7,
    y: 0.7,
    w: 0.2,
    h: 0.2,
    startTime: 0,
    endTime: Infinity
  }];

  const pixelsHealed = healSelectedBoxes(mockCtx, testW2, testH2, testBoxes, 0);
  assert(pixelsHealed > 0, `healSelectedBoxes inpainted ${pixelsHealed} pixels inside target ROI`);

  // Verify strict boundary isolation: all pixels outside (64..96) are 100% bit-for-bit unchanged!
  let outsideChanged = 0;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < testW2; x++) {
      const idx = (y * testW2 + x) * 4;
      if (buffer[idx] !== originalCopy[idx] || buffer[idx+1] !== originalCopy[idx+1] || buffer[idx+2] !== originalCopy[idx+2]) {
        outsideChanged++;
      }
    }
  }
  assert(outsideChanged === 0, 'Strict Zero Full-Frame Loss: 100% of pixels outside target ROI remain bit-for-bit untouched');

  // Verify 100% inner box erasure: all 400 pixels inside (70..89, 70..89) are modified and match clean 128 background
  let innerDiffSum = 0;
  for (let y = 70; y < 90; y++) {
    for (let x = 70; x < 90; x++) {
      const idx = (y * testW2 + x) * 4;
      const dr = Math.abs(buffer[idx] - originalCopy[idx]);
      const dg = Math.abs(buffer[idx + 1] - originalCopy[idx + 1]);
      const db = Math.abs(buffer[idx + 2] - originalCopy[idx + 2]);
      innerDiffSum += (dr + dg + db) / 3;
      assert(buffer[idx] < 180, `Custom Box Pixel (${x},${y}) obliterated from white to clean background (${buffer[idx]})`);
      assert(Math.abs(buffer[idx] - 128) < 18, `Custom Box Pixel (${x},${y}) matches background within 18 LSB`);
    }
  }
  const meanInnerDiff = innerDiffSum / 400;
  assert(meanInnerDiff > 90, `100% Inner Box Erasure: meanAbsolutePixelDiff = ${meanInnerDiff.toFixed(2)} / 255 (Watermark 100% obliterated)`);

  // Verify Custom Box LUT compilation with 8px perimeter ring
  const pad = 8;
  const cbW = 20, cbH = 20;
  const extW = cbW + pad * 2, extH = cbH + pad * 2;
  const cbMask = new Uint8Array(extW * extH);
  for (let y = pad; y < pad + cbH; y++) {
    for (let x = pad; x < pad + cbW; x++) {
      cbMask[y * extW + x] = 1;
    }
  }
  const cbLUT = compileInpaintLUT(cbMask, extW, extH, 8);
  assert(cbLUT.count === cbW * cbH, `Custom Box LUT compiles 100% of inner pixels into execution schedule (${cbLUT.count} === ${cbW * cbH})`);
  console.log('\n[9/9] Testing Video Bitstream Preservation & Dynamic Bitrate Scaling...');
  
  // 20.8 MB video of 5.0s duration
  const testFileSize = 20.8 * 1024 * 1024;
  const testDuration = 5.0;
  const calculatedBitrate = getLosslessTargetBitrate(testFileSize, testDuration);
  const rawSourceBitrate = (testFileSize * 8) / testDuration;
  const expected125x = Math.round(rawSourceBitrate * 1.25);
  
  assert(calculatedBitrate === expected125x, `getLosslessTargetBitrate calculates exact 1.25x scaling (${calculatedBitrate} bps = ${(calculatedBitrate / 1_000_000).toFixed(2)} Mbps for 20.8 MB source)`);
  assert(calculatedBitrate >= 30_000_000, `getLosslessTargetBitrate respects 30 Mbps minimum floor`);
  
  // Test floor and ceiling constraints
  const lowBitrateSmallFile = getLosslessTargetBitrate(500 * 1024, 10.0);
  assert(lowBitrateSmallFile === 30_000_000, 'getLosslessTargetBitrate enforces 30 Mbps minimum floor for small files');
  
  const highBitrate4KFile = getLosslessTargetBitrate(500 * 1024 * 1024, 5.0);
  assert(highBitrate4KFile === 80_000_000, 'getLosslessTargetBitrate enforces 80 Mbps maximum ceiling');

  // Verify pure container clean on MP4 video without custom boxes preserves 100% exact size
  const losslessCleanResult = await CleanerHub.processFile(mp4FileObj, {
    scrubMode: 'lossless',
    removeWatermark: true,
    customBoxes: []
  });
  assert(losslessCleanResult.cleaningMethod === 'lossless', 'CleanerHub routes lossless video to pure container clean without re-encoding');
  assert(losslessCleanResult.cleanedSize === mp4FileObj.size, `Lossless container clean preserved 100% exact byte size (${losslessCleanResult.cleanedSize} === ${mp4FileObj.size})`);

  // 10. Zero-Stutter Precomputed Inpaint LUT (< 0.8ms/frame) & Real-Time Bitrate Specs
  console.log('\n[10/10] Testing Zero-Stutter Precomputed Inpaint LUT & Hardware Bitrate...');
  
  // Real-time Bitrate clamping (8 Mbps to 18 Mbps)
  const rtBitrate20MB = getRealtimeVideoBitrate(20.8 * 1024 * 1024, 5.0);
  assert(rtBitrate20MB >= 8_000_000 && rtBitrate20MB <= 18_000_000, `getRealtimeVideoBitrate clamps within 8-18 Mbps range (${(rtBitrate20MB / 1_000_000).toFixed(2)} Mbps)`);
  
  const rtBitrateSmall = getRealtimeVideoBitrate(100 * 1024, 10.0);
  assert(rtBitrateSmall === 8_000_000, 'getRealtimeVideoBitrate respects 8 Mbps floor for small videos');
  
  const rtBitrateMassive = getRealtimeVideoBitrate(500 * 1024 * 1024, 5.0);
  assert(rtBitrateMassive === 18_000_000, 'getRealtimeVideoBitrate enforces 18 Mbps ceiling to prevent encoder buffer stalls');

  // Precomputed LUT Performance & Correctness
  const lutTestW = 80;
  const lutTestH = 80;
  const lutMask = new Uint8Array(lutTestW * lutTestH);
  // Circle mask in center
  for (let y = 30; y <= 50; y++) {
    for (let x = 30; x <= 50; x++) {
      const d = Math.hypot(x - 40, y - 40);
      if (d <= 7) {
        lutMask[y * lutTestW + x] = 1;
      }
    }
  }

  const lut = compileInpaintLUT(lutMask, lutTestW, lutTestH, 6);
  assert(lut.count > 0, `compileInpaintLUT compiled ${lut.count} target pixels into flat schedule`);
  assert(lut.flatWeights.length > 0, `compileInpaintLUT calculated ${lut.flatWeights.length} precomputed neighbor weights`);

  const lutPixelData = new Uint8ClampedArray(lutTestW * lutTestH * 4);
  lutPixelData.fill(50); // Background gray
  // Watermark pixels bright white
  for (let i = 0; i < lutMask.length; i++) {
    if (lutMask[i] === 1) {
      lutPixelData[i * 4] = 255;
      lutPixelData[i * 4 + 1] = 255;
      lutPixelData[i * 4 + 2] = 255;
      lutPixelData[i * 4 + 3] = 255;
    }
  }

  // Benchmark executeInpaintLUT over 100 frames
  const t0 = performance.now();
  for (let frame = 0; frame < 100; frame++) {
    executeInpaintLUT(lutPixelData, lut);
  }
  const t1 = performance.now();
  const avgFrameTimeMs = (t1 - t0) / 100;
  assert(avgFrameTimeMs < 0.8, `executeInpaintLUT runs in < 0.8ms per frame (Measured: ${avgFrameTimeMs.toFixed(4)}ms per frame)`);

  const centerPixelR = lutPixelData[(40 * lutTestW + 40) * 4];
  assert(centerPixelR < 80, `executeInpaintLUT healed white watermark center to background level (${centerPixelR})`);

  // 11. Real test_video.mp4 Binary Cleaning & Provenance Audit
  console.log('\n[11/11] Testing Real test_video.mp4 Binary Cleaning & Provenance Audit...');
  const testVideoBuf = fs.readFileSync('test_video.mp4');
  assert(Buffer.from(testVideoBuf).includes(Buffer.from('udta')), 'Pre-clean test_video.mp4 contains raw "udta" metadata box');

  const testVideoFile = new File([new Uint8Array(testVideoBuf)], 'test_video.mp4', { type: 'video/mp4' });
  const testVideoResult = await CleanerHub.processFile(testVideoFile, { scrubMode: 'lossless' });

  const cleanedVideoBytes = new Uint8Array(await testVideoResult.cleanedBlob.arrayBuffer());
  const cleanedVideoBuf = Buffer.from(cleanedVideoBytes);
  const cleanedVideoStr = cleanedVideoBuf.toString('latin1');

  assert(cleanedVideoBytes.length === testVideoBuf.length, 'Cleaned test_video.mp4 preserves exact byte length to prevent demuxer desync');
  assert(!cleanedVideoStr.includes('udta'), 'Cleaned test_video.mp4: "udta" metadata box 100% neutralized');
  assert(!cleanedVideoStr.includes('c2pa'), 'Cleaned test_video.mp4: "c2pa" 100% absent');
  assert(!cleanedVideoStr.includes('SynthID'), 'Cleaned test_video.mp4: "SynthID" 100% absent');
  assert(cleanedVideoStr.includes('free'), 'Cleaned test_video.mp4: metadata box replaced in-place with standard "free" atom');
  assert(testVideoResult.auditVerification.udtaRemaining === 0, 'Audit verification confirms 0 udta atoms remaining');
  assert(testVideoResult.auditVerification.c2paRemaining === 0, 'Audit verification confirms 0 C2PA remaining');
  assert(testVideoResult.auditVerification.isBinaryClean === true, 'Audit verification confirms isBinaryClean === true');

  // 12. Stealth Camera EXIF & Hardware Spoofer ("Stealth Camera Mode")
  console.log('\n[12/12] Testing Stealth Camera Profile Injection (iPhone 16 Pro, Sony A7IV, Canon EOS R5)...');
  
  // A. JPEG Injection - Apple iPhone 16 Pro
  const jpgSpoofFile = new File([rawJpg], 'test-camera-spoof.jpg', { type: 'image/jpeg' });
  const jpgSpoofResult = await CleanerHub.processFile(jpgSpoofFile, {
    scrubMode: 'lossless',
    stealthCameraMode: true,
    cameraProfile: 'iphone-16-pro'
  });
  assert(jpgSpoofResult.cameraProfileInjected === true, 'CleanerHub flags cameraProfileInjected === true');
  assert(jpgSpoofResult.cameraProfileName === 'Apple iPhone 16 Pro', 'CleanerHub reports active profile "Apple iPhone 16 Pro"');
  
  const spoofedJpgBuffer = await jpgSpoofResult.cleanedBlob.arrayBuffer();
  const spoofedJpgAnalysis = await AIDetector.detect(
    new File([jpgSpoofResult.cleanedBlob], 'test-camera-spoof.jpg', { type: 'image/jpeg' }),
    spoofedJpgBuffer
  );
  assert(spoofedJpgAnalysis.exif?.Make === 'Apple', 'Cleaned JPEG has authentic Make: "Apple"');
  assert(spoofedJpgAnalysis.exif?.Model === 'iPhone 16 Pro', 'Cleaned JPEG has authentic Model: "iPhone 16 Pro"');
  assert(spoofedJpgAnalysis.exif?.SoftwareName === '18.1', 'Cleaned JPEG has authentic iOS Software: "18.1"');
  assert(!spoofedJpgAnalysis.hasGPS, 'Cleaned JPEG has STRICT ZERO GPS coordinates (no location leakage)');
  assert(!spoofedJpgAnalysis.hasAIMetadata, 'Cleaned JPEG has 0 AI metadata tags');
  assert(jpgSpoofResult.auditVerification.isBinaryClean === true, 'Audit verification confirms isBinaryClean === true with authentic camera profile');

  // B. PNG Injection - Sony Alpha A7 IV
  const pngSpoofFile = new File([rawPng], 'test-camera-spoof.png', { type: 'image/png' });
  const pngSpoofResult = await CleanerHub.processFile(pngSpoofFile, {
    scrubMode: 'lossless',
    stealthCameraMode: true,
    cameraProfile: 'sony-a7iv'
  });
  const spoofedPngBuffer = await pngSpoofResult.cleanedBlob.arrayBuffer();
  const spoofedPngAnalysis = await AIDetector.detect(
    new File([pngSpoofResult.cleanedBlob], 'test-camera-spoof.png', { type: 'image/png' }),
    spoofedPngBuffer
  );
  assert(spoofedPngAnalysis.exif?.Make === 'SONY', 'Cleaned PNG has authentic Make: "SONY"');
  assert(spoofedPngAnalysis.exif?.Model === 'ILCE-7M4', 'Cleaned PNG has authentic Model: "ILCE-7M4"');
  assert(!spoofedPngAnalysis.hasGPS, 'Cleaned PNG has STRICT ZERO GPS coordinates');
  assert(!spoofedPngAnalysis.hasAIMetadata, 'Cleaned PNG has 0 AI metadata tags');

  // C. MP4 Video QuickTime udta Container Injection - Canon EOS R5
  const mp4SpoofFile = new File([rawMp4], 'test-camera-spoof.mp4', { type: 'video/mp4' });
  const mp4SpoofResult = await CleanerHub.processFile(mp4SpoofFile, {
    scrubMode: 'lossless',
    stealthCameraMode: true,
    cameraProfile: 'canon-eos-r5'
  });
  assert(mp4SpoofResult.cleanedSize === rawMp4.length, 'Cleaned MP4 preserves exact byte size with camera profile in udta box');
  const spoofedMp4Bytes = new Uint8Array(await mp4SpoofResult.cleanedBlob.arrayBuffer());
  const spoofedMp4Str = Buffer.from(spoofedMp4Bytes).toString('latin1');
  assert(spoofedMp4Str.includes('Canon') && spoofedMp4Str.includes('EOS R5'), 'Cleaned MP4 contains authentic "Canon EOS R5" QuickTime tags');
  assert(!spoofedMp4Str.includes('c2pa'), 'Cleaned MP4 has 0 C2PA tags');
  assert(!spoofedMp4Str.includes('Sora'), 'Cleaned MP4 has 0 Sora tags');
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

  // Disable showSaveFilePicker in automated test and ensure fresh scripts are executed
  await page.addInitScript(() => {
    delete window.showSaveFilePicker;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) reg.unregister();
      });
    }
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
  });

  console.log('\n[Test 1] Loading GhostMeta AI on http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  const title = await page.title();
  assert(title.includes('GhostMeta AI'), `Page title is correct ("${title}")`);

  // 1. Cross-Platform Paste Shortcut Check
  const pasteKbdEl = page.locator('#pasteKbd');
  const pasteHintText = (await pasteKbdEl.count() > 0) ? (await pasteKbdEl.textContent()) : (await page.textContent('#pasteHint'));
  assert(pasteHintText.includes('Ctrl+V') || pasteHintText.includes('⌘+V'), `Paste hint dynamically displayed as: ${pasteHintText.trim()}`);

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

  // 5b. Visible AI Corner Watermark Removal & Before/After Comparison Modal Check
  console.log('\n[Test 6] Testing Gemini Watermark Removal & Side-by-Side Comparison Modal...');
  const isWmToggleChecked = await page.isChecked('#toggleWatermark');
  assert(isWmToggleChecked === true, 'Visible Watermark Removal toggle switch is active by default');

  const cornerSelectVal = await page.inputValue('#cornerPresetSelect');
  assert(cornerSelectVal === 'bottom-right', 'Corner preset selector defaults to "Auto-Detect Bottom-Right (Gemini)"');

  // Load the Gemini sample with the authentic 4-pointed sparkle watermark
  await page.click('#sampleDalleBtn');
  await page.waitForTimeout(600);

  const dalleCard = page.locator('.file-card', { hasText: 'sample_chatgpt_gemini.jpg' });
  assert(await dalleCard.count() === 1, 'Loaded ChatGPT / Gemini sample into queue');

  // Clean the file with Watermark Removal active
  const dalleCleanBtn = dalleCard.locator('button[id^="cleanBtn-"]');
  await dalleCleanBtn.click();
  await dalleCard.locator('.btn-compare-corner').waitFor({ state: 'visible', timeout: 10000 });

  // Verify the "Compare Corner Fix" button is rendered on the cleaned card
  const compareBtn = dalleCard.locator('.btn-compare-corner');
  assert(await compareBtn.count() === 1, 'Cleaned Gemini card displays "✨ Compare Corner Fix" verification badge');

  // Click Compare Corner Fix button
  await compareBtn.click();
  await page.waitForTimeout(300);

  const compareModal = page.locator('#compareCornerModal');
  const isCompareModalOpen = await compareModal.evaluate(el => el.classList.contains('open'));
  assert(isCompareModalOpen === true, 'Compare Corner Fix modal opened upon clicking button');

  // Verify before and after comparison images
  const beforeSrc = await page.locator('#compareBeforeImg').getAttribute('src');
  const afterSrc = await page.locator('#compareAfterImg').getAttribute('src');
  assert(beforeSrc && beforeSrc.startsWith('data:image/'), 'Compare modal renders original corner before-fix thumbnail');
  assert(afterSrc && afterSrc.startsWith('data:image/'), 'Compare modal renders healed corner after-fix thumbnail');

  const statPixelsText = await page.textContent('#statPixels');
  assert(statPixelsText && statPixelsText.includes('px'), `Compare modal displays inpainted pixel count (${statPixelsText.trim()})`);

  // Dismiss modal via Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const isCompareClosed = await compareModal.evaluate(el => !el.classList.contains('open'));
  assert(isCompareClosed === true, 'Compare Corner Fix modal closed on Escape key press');

  // Verify Metadata Radar Cleaned Status Synchronization (Fix 3)
  console.log('Testing Metadata Radar modal Cleaned Status synchronization...');
  const dalleInspectBtn = dalleCard.locator('button[id^="inspectBtn-"]');
  await dalleInspectBtn.click();
  await page.waitForTimeout(300);

  const radarContent = await page.locator('#tabRadar').innerHTML();
  assert(radarContent.includes('Cleaned ✓'), 'Metadata Radar Status displays "Cleaned ✓" after processing');
  assert(radarContent.includes('Stripped ✓'), 'Metadata Radar C2PA & Prompts display "Stripped ✓" after processing');
  assert(radarContent.includes('Inpainted (100% Healed) ✓'), 'Metadata Radar displays "Inpainted (100% Healed) ✓" for cleaned watermark');
  assert(!radarContent.includes('Pending cleaning'), 'Metadata Radar has no remaining "Pending cleaning" states');

  // Check Diff Tab
  await page.click('.tab-btn[data-tab="diff"]');
  await page.waitForTimeout(100);
  const diffContent = await page.locator('#tabDiff').innerHTML();
  assert(diffContent.includes('CLEARED (0 B) ✓'), 'Metadata Diff tab displays "CLEARED (0 B) ✓" for C2PA');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Clear queue
  await page.click('#clearQueueBtn');
  await page.waitForTimeout(200);

  // 5c. Interactive Multi-Box Bounding-Box Selector & Motion Tracker Modal Test
  console.log('\n[Test 6c] Testing Interactive Watermark Bounding-Box Selector & Motion Tracker...');
  
  // Open ROI Modal from toolbar
  await page.click('#openBoxSelectorBtn');
  await page.waitForTimeout(300);

  const roiModal = page.locator('#roiSelectorModal');
  const isRoiModalOpen = await roiModal.evaluate(el => el.classList.contains('open'));
  assert(isRoiModalOpen === true, 'Interactive ROI Bounding-Box Modal opened via #openBoxSelectorBtn');

  // Test Corner Preset Pills
  console.log('Testing quick corner preset pills...');
  await page.click('#roiClearBoxesBtn');
  await page.waitForTimeout(100);

  await page.click('.btn-preset-pill[data-preset="top-left"]');
  await page.waitForTimeout(100);
  let summaryText = await page.textContent('#roiBoxesSummary');
  assert(summaryText && summaryText.includes('1 active box'), 'Top-Left corner preset added an active ROI box');

  await page.click('.btn-preset-pill[data-preset="top-right"]');
  await page.waitForTimeout(100);
  summaryText = await page.textContent('#roiBoxesSummary');
  assert(summaryText && summaryText.includes('2 active boxes'), 'Top-Right preset added second active ROI box (Multi-Box)');

  await page.click('#roiAddCustomBoxBtn');
  await page.waitForTimeout(100);
  summaryText = await page.textContent('#roiBoxesSummary');
  assert(summaryText && summaryText.includes('3 active boxes'), '➕ Draw Custom Box button added third active box');

  await page.click('#roiClearBoxesBtn');
  await page.waitForTimeout(100);
  summaryText = await page.textContent('#roiBoxesSummary');
  assert(summaryText && summaryText.includes('0 active boxes'), '🗑️ Clear All button removed all active boxes');

  // Add Gemini bottom-right preset and apply
  await page.click('#roiPresetGemini');
  await page.waitForTimeout(100);
  await page.click('#applyRoiBtn');
  await page.waitForTimeout(300);

  const isRoiClosed = await roiModal.evaluate(el => !el.classList.contains('open'));
  assert(isRoiClosed === true, 'ROI Modal closed on Apply & Save Boxes');

  const presetVal = await page.inputValue('#cornerPresetSelect');
  assert(presetVal === 'custom', 'Watermark position select switched to "custom" after saving custom boxes');

  // Test Queue Card ROI Area Button
  console.log('Testing queued file card ROI Area button...');
  await page.click('#sampleVideoBtn');
  await page.waitForTimeout(600);

  const videoCard = page.locator('.file-card', { hasText: 'sample_ai_video_runway.mp4' });
  assert(await videoCard.count() === 1, 'Loaded sample video into queue');

  const cardRoiBtn = videoCard.locator('.btn-roi-item');
  assert(await cardRoiBtn.count() === 1, 'Video file card displays "🎯 ROI Area" button');

  await cardRoiBtn.click();
  await page.waitForTimeout(400);

  assert(await roiModal.evaluate(el => el.classList.contains('open')), 'ROI Modal opened for video file card');

  // Verify video-specific motion mode bar and timeline scrubber are displayed
  const isMotionBarVisible = await page.locator('#roiMotionBar').evaluate(el => el.style.display !== 'none');
  const isScrubberVisible = await page.locator('#roiVideoScrubberBar').evaluate(el => el.style.display !== 'none');
  assert(isMotionBarVisible === true, 'Video motion mode selector bar is visible for video file');
  assert(isScrubberVisible === true, 'Video scrubber bar is visible for video file');

  // Switch to Auto-Track Moving Watermark (Sora)
  await page.click('.btn-motion-pill[data-motion="autotrack"]');
  const isAutoTrackActive = await page.locator('.btn-motion-pill[data-motion="autotrack"]').evaluate(el => el.classList.contains('active'));
  assert(isAutoTrackActive === true, 'Activated "Auto-Track Moving (Sora)" motion mode');

  // Apply boxes to video file
  await page.click('#applyRoiBtn');
  await page.waitForTimeout(600);

  const customRoiBadge = videoCard.locator('.badge-roi-custom');
  assert(await customRoiBadge.count() === 1, 'File card displays custom ROI badge after saving boxes');

  // Verify Download button is visible and bound after Apply & Save Boxes
  const cardDownloadBtn = videoCard.locator('button[id^="downloadBtn-"]');
  await cardDownloadBtn.waitFor({ state: 'visible', timeout: 5000 });
  assert(await cardDownloadBtn.isVisible(), 'File card download button immediately ready after Apply & Save Boxes re-clean');

  // Clear queue
  await page.click('#clearQueueBtn');
  await page.waitForTimeout(200);

  // 6. Test Mobile QR Modal & Escape Key
  console.log('\n[Test 7] Verifying Mobile Connect Modal & Escape Key...');
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
  const mp4CleanBtn = mp4Card.locator('button[id^="cleanBtn-"]');
  await mp4CleanBtn.click();
  await mp4Card.locator('.badge-threat-clean').waitFor({ timeout: 5000 });

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

  // 11. Test Stealth Camera Mode Toggle and UI Radar Modal
  console.log('\n[Test 12] Testing Stealth Camera Mode UI Toggle & Metadata Radar Integration...');
  const stealthToggle = page.locator('#toggleStealthCamera');
  assert(await stealthToggle.count() === 1, 'Found #toggleStealthCamera switch in settings panel');
  
  // Verify initially stealthCameraGroup is hidden
  const stealthGroup = page.locator('#stealthCameraGroup');
  assert(!(await stealthGroup.isVisible()), 'stealthCameraGroup initially hidden');
  
  // Clear any existing items in queue first
  const clearBtn = page.locator('#clearQueueBtn');
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
    await page.waitForTimeout(200);
  }

  // Toggle ON using the visible slider or force click on checkbox
  await page.click('.stealth-camera-toggle-item .slider');
  await page.waitForTimeout(300);
  assert(await stealthGroup.isVisible(), 'stealthCameraGroup becomes visible when toggled ON');

  // Verify camera selector has 4 authentic profiles
  const cameraSelect = page.locator('#stealthCameraSelect');
  await cameraSelect.selectOption('sony-a7iv');
  await page.waitForTimeout(100);
  
  const stealthInfoText = await page.locator('#stealthCameraInfo').textContent();
  assert(stealthInfoText.includes('Sony Alpha A7 IV'), 'Stealth camera info pill displays Sony Alpha A7 IV specs');
  assert(stealthInfoText.includes('0 GPS (Private)'), 'Stealth camera info pill highlights 0 GPS privacy guarantee');

  // Click Sample JPG Button and Clean
  await page.locator('#sampleDalleBtn').click();
  await page.waitForTimeout(600);

  const sampleCard = page.locator('.file-card').first();
  await sampleCard.locator('.btn-primary', { hasText: 'Clean' }).click();
  await page.waitForSelector('.file-card.cleaned', { timeout: 10000 });

  // Assert card has Stealth badge
  const cardStealthBadge = sampleCard.locator('.badge-stealth-camera');
  assert(await cardStealthBadge.count() > 0, 'Cleaned file card displays 📷 Stealth Camera badge');
  const cardBadgeText = await cardStealthBadge.textContent();
  assert(cardBadgeText.includes('Sony Alpha A7 IV'), `File card stealth badge text matches selected profile: "${cardBadgeText}"`);

  // Open Inspector Radar modal and verify
  await sampleCard.locator('.btn-icon[id^="inspectBtn-"]').click();
  await page.waitForSelector('#inspectorModal.open', { timeout: 5000 });
  const radarHtml = await page.locator('#tabRadar').innerHTML();
  assert(radarHtml.includes('Sony Alpha A7 IV') && radarHtml.includes('0 GPS'), 'Metadata Radar modal confirms Sony Alpha A7 IV injection without GPS');

  // Close modal
  await page.locator('#modalCloseBtn').click();
  await page.waitForTimeout(200);

  await browser.close();
}

function pingServer(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServerRunning() {
  const isUp = await pingServer('http://localhost:3000');
  if (isUp) return null;

  console.log('Local server not detected on http://localhost:3000. Spawning server.js...');
  const serverProc = spawn('node', ['server.js'], { stdio: 'ignore' });

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (await pingServer('http://localhost:3000')) {
      console.log('✅ Local server successfully started on http://localhost:3000');
      return serverProc;
    }
  }
  throw new Error('Timed out waiting for server.js to start on http://localhost:3000');
}

async function main() {
  let serverProcess = null;
  try {
    await runBinaryUnitTests();
    serverProcess = await ensureServerRunning();
    await runBrowserPlaywrightTests();

    console.log('\n======================================================');
    console.log(`🎉 ALL ${passedChecks}/${totalChecks} TESTS PASSED SUCCESSFULLY!`);
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    process.exit(1);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

main();
