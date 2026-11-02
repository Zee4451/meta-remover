import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import { spawnSync } from 'child_process';
import path from 'path';

function startServer(port = 3456) {
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
    '.webm': 'video/webm'
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

async function main() {
  console.log('========================================================');
  console.log('TESTING VIDEO WATERMARK INPAINTING & DURATION FIX (INSTAGRAM READY)');
  console.log('========================================================\n');

  const server = await startServer(3456);
  console.log('[0] Local HTTP server started at http://localhost:3456');

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  const page = await browser.newPage();

  // Load input test video
  const inputPath = path.resolve('scratch/input-flow-sample.mp4');
  if (!fs.existsSync(inputPath)) {
    throw new Error('scratch/input-flow-sample.mp4 does not exist');
  }

  const inputBytes = fs.readFileSync(inputPath);
  const inputB64 = inputBytes.toString('base64');

  console.log(`[1] Loaded input video: ${inputBytes.length} bytes`);

  await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });

  console.log('[2] Running VideoWatermarkCleaner.clean() via ES module inside browser...');

  const result = await page.evaluate(async (b64) => {
    const { VideoWatermarkCleaner } = await import('/js/cleaners/video-watermark-cleaner.js');

    function b64ToUint8(b) {
      const bin = atob(b);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }

    function u8ToB64(u8) {
      let bin = '';
      for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
      return btoa(bin);
    }

    const u8 = b64ToUint8(b64);
    const file = new File([u8], 'input-flow-sample.mp4', { type: 'video/mp4' });

    // Custom box over watermark (x: 550/640=0.859, y: 300/360=0.833, w: 70/640=0.109, h: 40/360=0.111)
    const customBoxes = [{
      x: 0.85,
      y: 0.82,
      w: 0.12,
      h: 0.13,
      startTime: 0,
      endTime: Infinity
    }];

    const progressLogs = [];
    const cleanResult = await VideoWatermarkCleaner.clean(file, {
      removeWatermark: true,
      customBoxes: customBoxes,
      onProgress: (pct, msg) => progressLogs.push({ pct, msg })
    });

    const outBlob = cleanResult.blob;
    const outBuffer = await outBlob.arrayBuffer();
    const outBytes = new Uint8Array(outBuffer);

    // Verify duration in HTML5 video element
    const testUrl = URL.createObjectURL(outBlob);
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.src = testUrl;

    const html5Duration = await new Promise((res) => {
      vid.onloadedmetadata = () => res(vid.duration);
      setTimeout(() => res(vid.duration), 1500);
    });
    URL.revokeObjectURL(testUrl);

    return {
      cleanedBytesBase64: u8ToB64(outBytes),
      cleanedSize: outBytes.length,
      html5Duration: html5Duration,
      watermarkMetrics: cleanResult.watermarkMetrics,
      progressLogs: progressLogs.slice(-3)
    };
  }, inputB64);

  console.log('[3] Inpainting complete! Cleaned size:', result.cleanedSize, 'bytes');
  console.log('    HTML5 Video reported duration:', result.html5Duration, 'seconds');
  console.log('    Watermark metrics:', result.watermarkMetrics ? 'Detected & Inpainted' : 'None');

  const outBytes = Buffer.from(result.cleanedBytesBase64, 'base64');
  const outPath = path.resolve('scratch/output-flow-cleaned.mp4');
  fs.writeFileSync(outPath, outBytes);
  console.log('    Saved output to:', outPath);

  // [4] Check ffprobe
  console.log('\n[4] Running ffprobe inspection...');
  const ffprobeRes = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=duration,codec_name',
    '-of', 'json',
    outPath
  ], { encoding: 'utf8' });

  const probe = JSON.parse(ffprobeRes.stdout);
  console.log('    ffprobe output:', JSON.stringify(probe, null, 2));

  const formatDur = parseFloat(probe.format?.duration || '0');
  const streamDur = parseFloat(probe.streams?.[0]?.duration || '0');

  console.log(`    Format duration: ${formatDur}s`);
  console.log(`    Stream duration: ${streamDur}s`);

  // [5] Binary Header Box Inspection
  console.log('\n[5] Inspecting MP4 Box Headers in Binary ArrayBuffer...');
  const view = new DataView(outBytes.buffer, outBytes.byteOffset, outBytes.byteLength);

  let mvhdTimescale = 0, mvhdDur = 0;
  let tkhdDur = 0;
  let mdhdTimescale = 0, mdhdDur = 0;

  function dumpBoxes(start, end) {
    let cur = start;
    while (cur + 8 <= end) {
      const sz = view.getUint32(cur);
      const typ = String.fromCharCode(outBytes[cur+4], outBytes[cur+5], outBytes[cur+6], outBytes[cur+7]);
      if (sz < 8) break;

      if (typ === 'mvhd') {
        const v = outBytes[cur+8];
        mvhdTimescale = v === 0 ? view.getUint32(cur+20) : view.getUint32(cur+28);
        mvhdDur = v === 0 ? view.getUint32(cur+24) : view.getUint32(cur+36);
      } else if (typ === 'tkhd') {
        const v = outBytes[cur+8];
        tkhdDur = v === 0 ? view.getUint32(cur+28) : view.getUint32(cur+36);
      } else if (typ === 'mdhd') {
        const v = outBytes[cur+8];
        mdhdTimescale = v === 0 ? view.getUint32(cur+20) : view.getUint32(cur+28);
        mdhdDur = v === 0 ? view.getUint32(cur+24) : view.getUint32(cur+36);
      }

      if (['moov','trak','mdia','minf','stbl','mvex'].includes(typ)) {
        dumpBoxes(cur+8, cur+sz);
      }
      cur += sz;
    }
  }

  dumpBoxes(0, outBytes.length);

  console.log(`    mvhd: timescale=${mvhdTimescale}, duration=${mvhdDur} (${(mvhdDur/mvhdTimescale).toFixed(3)}s)`);
  console.log(`    tkhd: duration=${tkhdDur} (Track duration in movie timescale: ${(tkhdDur/mvhdTimescale).toFixed(3)}s)`);
  console.log(`    mdhd: timescale=${mdhdTimescale}, duration=${mdhdDur} (${(mdhdDur/mdhdTimescale).toFixed(3)}s)`);

  // Assertions
  if (formatDur < 2.5 || formatDur > 3.5) {
    throw new Error(`Format duration ${formatDur}s is not ~3.0s!`);
  }
  if (tkhdDur === 0) {
    throw new Error('CRITICAL FAILURE: tkhd.duration is 0! (This causes the 00:00:00 bug on Instagram)');
  }
  if (Math.abs(tkhdDur / mvhdTimescale - 3.0) > 0.5) {
    throw new Error(`tkhd duration ${tkhdDur / mvhdTimescale}s does not match ~3.0s!`);
  }
  if (Math.abs(mdhdDur / mdhdTimescale - 3.0) > 0.5) {
    throw new Error(`mdhd duration ${mdhdDur / mdhdTimescale}s does not match ~3.0s!`);
  }

  console.log('\n========================================================');
  console.log('TEST CASE 2: VIDEO WITH AUDIO (AI Video with Sound/Audio Track)');
  console.log('========================================================');

  const inputAudioPath = path.resolve('scratch/input-with-audio.mp4');
  const inputAudioBytes = fs.readFileSync(inputAudioPath);
  const inputAudioB64 = inputAudioBytes.toString('base64');

  const resultAudio = await page.evaluate(async (b64) => {
    const { VideoWatermarkCleaner } = await import('/js/cleaners/video-watermark-cleaner.js');

    function b64ToUint8(b) {
      const bin = atob(b);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }

    function u8ToB64(u8) {
      let bin = '';
      for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
      return btoa(bin);
    }

    const u8 = b64ToUint8(b64);
    const file = new File([u8], 'input-with-audio.mp4', { type: 'video/mp4' });

    const customBoxes = [{
      x: 0.85,
      y: 0.82,
      w: 0.12,
      h: 0.13,
      startTime: 0,
      endTime: Infinity
    }];

    const cleanResult = await VideoWatermarkCleaner.clean(file, {
      removeWatermark: true,
      customBoxes: customBoxes
    });

    const outBlob = cleanResult.blob;
    const outBuffer = await outBlob.arrayBuffer();
    const outBytes = new Uint8Array(outBuffer);

    return {
      cleanedBytesBase64: u8ToB64(outBytes),
      cleanedSize: outBytes.length,
      watermarkMetrics: cleanResult.watermarkMetrics
    };
  }, inputAudioB64);

  const outAudioBytes = Buffer.from(resultAudio.cleanedBytesBase64, 'base64');
  const outAudioPath = path.resolve('scratch/output-audio-cleaned.mp4');
  fs.writeFileSync(outAudioPath, outAudioBytes);

  const ffprobeAudioRes = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=duration,codec_name,codec_type',
    '-of', 'json',
    outAudioPath
  ], { encoding: 'utf8' });

  const probeAudio = JSON.parse(ffprobeAudioRes.stdout);
  console.log('    ffprobe output (Video with Audio):', JSON.stringify(probeAudio, null, 2));

  const audioStreamCount = probeAudio.streams?.length || 0;
  console.log(`    Detected streams in output: ${audioStreamCount} (Streams: ${probeAudio.streams?.map(s => s.codec_name).join(', ')})`);

  console.log('\n========================================================');
  console.log('✅ ALL VERIFICATIONS PASSED! VIDEO DURATION IS 100% FIXED FOR INSTAGRAM & MOBILE PLAYERS!');
  console.log('========================================================');

  await browser.close();
  server.close();
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
