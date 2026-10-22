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

    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|avif)$/i.test(file.name);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);

    if (options.scrubMode === 'deep' && isImage) {
      // Deep Canvas Scrub
      cleaningMethod = 'deep-canvas';
      let targetFormat = 'image/png';
      if (options.exportFormat === 'original') {
        targetFormat = file.type || 'image/png';
      } else if (options.exportFormat) {
        targetFormat = options.exportFormat;
      }

      cleanedBlob = await CanvasCleaner.clean(file, {
        format: targetFormat,
        quality: options.quality || 0.98,
        antiSynthID: options.antiSynthID ?? true
      });
    } else {
      // Lossless Container Stripping
      const name = file.name.toLowerCase();
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
      } else if (isVideo) {
        cleanedBytes = MP4Cleaner.clean(originalBuffer);
        cleanedBlob = new Blob([cleanedBytes], { type: file.type || 'video/mp4' });
      } else {
        // Fallback for other image formats (GIF, AVIF, etc.): clean via Canvas
        cleaningMethod = 'deep-canvas-fallback';
        cleanedBlob = await CanvasCleaner.clean(file, {
          format: 'image/png',
          quality: 0.98,
          antiSynthID: false
        });
      }
    }

    // 2. Post-cleaning metadata verification!
    const cleanedBuffer = await cleanedBlob.arrayBuffer();
    const afterAnalysis = await AIDetector.detect(
      new File([cleanedBlob], file.name, { type: cleanedBlob.type }),
      cleanedBuffer
    );

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    // Generate output filename
    const extMatch = file.name.match(/\.[^.]+$/);
    const ext = extMatch ? extMatch[0] : (isVideo ? '.mp4' : (isImage ? '.jpg' : ''));
    const baseName = extMatch ? file.name.slice(0, -ext.length) : file.name;
    const safeBaseName = baseName.replace(/[<>:"/\\|?*]/g, '_').trim();
    const cleanFileName = `${safeBaseName}_clean${ext || (cleanedBlob.type === 'image/png' ? '.png' : '.jpg')}`;

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
      isFullyClean: !afterAnalysis.hasAIMetadata && !afterAnalysis.hasGPS && Object.keys(afterAnalysis.exif).length === 0
    };
  }
}
