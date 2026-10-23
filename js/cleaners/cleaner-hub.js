/**
 * GhostMeta AI - Central Cleaning Coordinator
 * Dispatches files to appropriate lossless or deep canvas scrubbers
 * and returns cleaned Blobs along with detailed before/after diffs.
 */

import { AIDetector } from '../detectors/ai-detector.js';
import { JPEGCleaner } from './jpeg-cleaner.js';
import { PNGCleaner } from './png-cleaner.js';
import { WebPCleaner } from './webp-cleaner.js';
import { MP4Cleaner } from './mp4-cleaner.js';
import { CanvasCleaner } from './canvas-cleaner.js';
import { VideoWatermarkCleaner } from './video-watermark-cleaner.js';

export class CleanerHub {
  /**
   * Process a single file
   * @param {File} file 
   * @param {Object} options 
   * @returns {Promise<Object>} Processed result
   */
  static async processFile(file, options = {}) {
    const startTime = performance.now();
    const originalBuffer = await file.arrayBuffer();

    // 1. Initial metadata inspection
    const beforeAnalysis = await AIDetector.detect(file, originalBuffer);

    let cleanedBlob = null;
    let cleaningMethod = 'lossless';
    let watermarkMetrics = null;

    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|avif)$/i.test(file.name);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    const name = file.name.toLowerCase();

    // Priority Check: Does user request visible AI watermark removal?
    const removeWatermark = !!options.removeWatermark;

    if (isVideo) {
      if (removeWatermark) {
        // High-Bitrate Frame-Accurate Video Watermark Inpainting
        cleaningMethod = 'video-watermark-canvas';
        cleanedBlob = await VideoWatermarkCleaner.clean(file, {
          removeWatermark: true,
          corner: options.corner || 'bottom-right',
          customROI: options.customROI || null
        });
        watermarkMetrics = {
          watermarkDetected: true,
          inpaintType: 'video-frame-inpaint'
        };
      } else if (options.scrubMode === 'deep') {
        // Video Graceful Fallback: Canvas 2D cannot re-encode multi-track video/audio streams.
        // Fall back to lossless container clean to preserve playback & audio synchronization.
        cleaningMethod = 'lossless-video-fallback';
        const cleanedBytes = MP4Cleaner.clean(originalBuffer);
        cleanedBlob = new Blob([cleanedBytes], { type: file.type || 'video/mp4' });
      } else {
        // Standard Lossless MP4/MOV container clean (0% re-encoding)
        cleaningMethod = 'lossless';
        const cleanedBytes = MP4Cleaner.clean(originalBuffer);
        cleanedBlob = new Blob([cleanedBytes], { type: file.type || 'video/mp4' });
      }
    } else if (isImage) {
      if (removeWatermark || options.scrubMode === 'deep') {
        // Image Canvas Pipeline: Used when inpainting visible watermarks or deep anti-SynthID dither is requested
        cleaningMethod = removeWatermark 
          ? (options.scrubMode === 'deep' ? 'deep-canvas-watermark' : 'lossless-watermark-canvas')
          : 'deep-canvas';

        let targetFormat = 'image/png';
        if (options.exportFormat && options.exportFormat !== 'original') {
          targetFormat = options.exportFormat;
        } else {
          // Preserve source container format to retain alpha transparency (PNG/WebP)
          if (name.endsWith('.webp') || file.type === 'image/webp') {
            targetFormat = 'image/webp';
          } else if (name.endsWith('.jpg') || name.endsWith('.jpeg') || file.type === 'image/jpeg') {
            targetFormat = 'image/jpeg';
          } else {
            targetFormat = 'image/png';
          }
        }

        const canvasResult = await CanvasCleaner.clean(file, {
          format: targetFormat,
          quality: 1.0, // Guaranteed 100% maximum encoding quality
          antiSynthID: options.scrubMode === 'deep' ? (options.antiSynthID ?? true) : false,
          removeWatermark: removeWatermark,
          corner: options.corner || 'bottom-right',
          customROI: options.customROI || null,
          watermarkSensitivity: options.watermarkSensitivity || 1.0
        });

        cleanedBlob = canvasResult.blob;
        watermarkMetrics = canvasResult.watermarkMetrics;
      } else {
        // GUARANTEED ZERO VISUAL QUALITY LOSS:
        // When only metadata scrubbing is requested, strictly use Binary ArrayBuffer Scrubber
        // so that 0% re-encoding occurs (100% bit-for-bit identical media stream).
        cleaningMethod = 'lossless';
        let cleanedBytes = null;

        if (name.endsWith('.jpg') || name.endsWith('.jpeg') || file.type === 'image/jpeg') {
          cleanedBytes = JPEGCleaner.clean(originalBuffer, { keepICC: options.keepICC ?? false });
          cleanedBlob = new Blob([cleanedBytes], { type: 'image/jpeg' });
        } else if (name.endsWith('.png') || file.type === 'image/png') {
          cleanedBytes = PNGCleaner.clean(originalBuffer, { keepICC: options.keepICC ?? false });
          cleanedBlob = new Blob([cleanedBytes], { type: 'image/png' });
        } else if (name.endsWith('.webp') || file.type === 'image/webp') {
          cleanedBytes = WebPCleaner.clean(originalBuffer);
          cleanedBlob = new Blob([cleanedBytes], { type: 'image/webp' });
        } else {
          // Fallback for uncommon image formats (GIF, AVIF): clean via Canvas at 100% quality
          cleaningMethod = 'deep-canvas-fallback';
          const canvasResult = await CanvasCleaner.clean(file, {
            format: 'image/png',
            quality: 1.0,
            antiSynthID: false,
            removeWatermark: false
          });
          cleanedBlob = canvasResult.blob;
          watermarkMetrics = canvasResult.watermarkMetrics;
        }
      }
    } else {
      // Unknown generic binary: passthrough clean
      cleanedBlob = new Blob([originalBuffer], { type: file.type || 'application/octet-stream' });
    }

    // 2. Post-cleaning metadata verification!
    const cleanedBuffer = await cleanedBlob.arrayBuffer();
    const afterAnalysis = await AIDetector.detect(
      new File([cleanedBlob], file.name, { type: cleanedBlob.type }),
      cleanedBuffer
    );

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    // Generate output filename matching exact container format
    const extMatch = file.name.match(/\.[^.]+$/);
    let ext = extMatch ? extMatch[0].toLowerCase() : (isVideo ? '.mp4' : (isImage ? '.jpg' : ''));
    if (cleaningMethod.includes('canvas')) {
      if (cleanedBlob.type === 'image/png') ext = '.png';
      else if (cleanedBlob.type === 'image/webp') ext = '.webp';
      else if (cleanedBlob.type === 'image/jpeg') ext = '.jpg';
    }
    const baseName = extMatch ? file.name.slice(0, -extMatch[0].length) : file.name;
    const safeBaseName = baseName.replace(/[<>:"/\\|?*]/g, '_').trim();
    const cleanFileName = `${safeBaseName}_clean${ext}`;

    return {
      id: Math.random().toString(36).substring(2, 9),
      originalFile: file,
      cleanedBlob: cleanedBlob,
      cleanFileName: cleanFileName,
      cleaningMethod: cleaningMethod,
      durationMs: durationMs,
      originalSize: file.size,
      cleanedSize: cleanedBlob.size,
      sizeDiff: file.size - cleanedBlob.size,
      beforeAnalysis: beforeAnalysis,
      afterAnalysis: afterAnalysis,
      watermarkMetrics: watermarkMetrics,
      isFullyClean: !afterAnalysis.hasAIMetadata && !afterAnalysis.hasGPS && Object.keys(afterAnalysis.exif).length === 0
    };
  }
}
