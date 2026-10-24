import fs from 'fs';
import { execSync } from 'child_process';
import { compileInpaintLUT, executeInpaintLUT } from './js/cleaners/video-watermark-cleaner.js';

const rawBin = 'C:\\Users\\yasht\\.gemini\\antigravity-ide\\brain\\ef636ac9-a930-4b23-9354-f15cc5c0fbfa\\full_raw.bin';
const buf = new Uint8ClampedArray(fs.readFileSync(rawBin));
const w = 720, h = 1280;

const roiW = Math.round(w * 0.32);
const roiH = Math.round(h * 0.25);
const roiX = w - roiW;
const roiY = h - roiH;

const roiBuffer = new Uint8ClampedArray(roiW * roiH * 4);
for (let y = 0; y < roiH; y++) {
  const src = ((roiY + y) * w + roiX) * 4;
  const dst = y * roiW * 4;
  roiBuffer.set(buf.subarray(src, src + roiW * 4), dst);
}

const totalPixels = roiW * roiH;
const lum = new Float32Array(totalPixels);
const sat = new Float32Array(totalPixels);
for (let i = 0, p = 0; i < totalPixels; i++, p += 4) {
  const r = roiBuffer[p], g = roiBuffer[p + 1], b = roiBuffer[p + 2];
  lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
}

// Separable 2D Box Blur with radius 20
function boxBlur(input, bw, bh, radius) {
  const temp = new Float32Array(bw * bh);
  const out = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    let sum = 0, count = 0;
    for (let x = -radius; x <= radius; x++) {
      if (x >= 0 && x < bw) { sum += input[y * bw + x]; count++; }
    }
    for (let x = 0; x < bw; x++) {
      temp[y * bw + x] = sum / count;
      const rx = x - radius, ax = x + radius + 1;
      if (rx >= 0) { sum -= input[y * bw + rx]; count--; }
      if (ax < bw) { sum += input[y * bw + ax]; count++; }
    }
  }
  for (let x = 0; x < bw; x++) {
    let sum = 0, count = 0;
    for (let y = -radius; y <= radius; y++) {
      if (y >= 0 && y < bh) { sum += temp[y * bw + x]; count++; }
    }
    for (let y = 0; y < bh; y++) {
      out[y * bw + x] = sum / count;
      const ry = y - radius, ay = y + radius + 1;
      if (ry >= 0) { sum -= temp[ry * bw + x]; count--; }
      if (ay < bh) { sum += temp[ay * bw + x]; count++; }
    }
  }
  return out;
}

const bgLum = boxBlur(lum, roiW, roiH, 20);
const rawMask = new Uint8Array(totalPixels);

for (let y = 2; y < roiH - 2; y++) {
  for (let x = 2; x < roiW - 2; x++) {
    const idx = y * roiW + x;
    const l = lum[idx];
    const s = sat[idx];
    const bg = bgLum[idx];
    const delta = l - bg;

    // Detect watermark: bright highlight relative to wide background, neutral chroma
    if ((delta > 14 && s < 65 && l > 115) || (l > 155 && s < 45 && delta > 10)) {
      rawMask[idx] = 1;
    }
  }
}

// Morphological hole filling:
// Invert mask, flood fill from outer borders to find exterior, then any non-exterior 0s are internal holes!
function fillHoles(mask, bw, bh) {
  const filled = new Uint8Array(mask);
  const exterior = new Uint8Array(bw * bh);
  const q = [];

  // Seed exterior with border pixels that are 0
  for (let x = 0; x < bw; x++) {
    if (mask[x] === 0) { exterior[x] = 1; q.push(x); }
    const btm = (bh - 1) * bw + x;
    if (mask[btm] === 0) { exterior[btm] = 1; q.push(btm); }
  }
  for (let y = 0; y < bh; y++) {
    const lft = y * bw;
    if (mask[lft] === 0 && !exterior[lft]) { exterior[lft] = 1; q.push(lft); }
    const rgt = y * bw + (bw - 1);
    if (mask[rgt] === 0 && !exterior[rgt]) { exterior[rgt] = 1; q.push(rgt); }
  }

  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const cx = cur % bw;
    const cy = Math.floor(cur / bw);

    const neighbors = [
      cy > 0 ? cur - bw : -1,
      cy < bh - 1 ? cur + bw : -1,
      cx > 0 ? cur - 1 : -1,
      cx < bw - 1 ? cur + 1 : -1
    ];

    for (const nb of neighbors) {
      if (nb >= 0 && mask[nb] === 0 && exterior[nb] === 0) {
        exterior[nb] = 1;
        q.push(nb);
      }
    }
  }

  // Any pixel that is NOT exterior is inside the watermark!
  for (let i = 0; i < bw * bh; i++) {
    if (exterior[i] === 0) {
      filled[i] = 1;
    }
  }
  return filled;
}

const holeFilled = fillHoles(rawMask, roiW, roiH);

// Dilate mask with radius 4
function dilate(mask, bw, bh, r) {
  const out = new Uint8Array(bw * bh);
  const rSq = r * r;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (mask[y * bw + x] === 1) {
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= bh) continue;
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= bw) continue;
            if (dx * dx + dy * dy <= rSq) {
              out[ny * bw + nx] = 1;
            }
          }
        }
      }
    }
  }
  return out;
}

const dilated = dilate(holeFilled, roiW, roiH, 4);
const dCount = dilated.filter(v => v === 1).length;
console.log('Dilated count:', dCount);

const lx = 604 - roiX;
const ly = 1147 - roiY;
console.log('--- DILATED MASK around center (-15 to +15) ---');
for (let dy = -15; dy <= 15; dy += 2) {
  let line = '';
  for (let dx = -15; dx <= 15; dx += 2) {
    const val = dilated[(ly + dy) * roiW + (lx + dx)];
    line += val ? '█' : '·';
  }
  console.log(line);
}

// Inpaint using LUT
const lut = compileInpaintLUT(dilated, roiW, roiH, 8);
console.log('LUT count:', lut.count);
executeInpaintLUT(roiBuffer, lut);

// Write back to buf
for (let y = 0; y < roiH; y++) {
  const src = y * roiW * 4;
  const dst = ((roiY + y) * w + roiX) * 4;
  buf.set(roiBuffer.subarray(src, src + roiW * 4), dst);
}

const outBin = 'C:\\Users\\yasht\\.gemini\\antigravity-ide\\brain\\ef636ac9-a930-4b23-9354-f15cc5c0fbfa\\test_healed.bin';
fs.writeFileSync(outBin, buf);

const outPng = 'C:\\Users\\yasht\\.gemini\\antigravity-ide\\brain\\ef636ac9-a930-4b23-9354-f15cc5c0fbfa\\test_cropped.png';
execSync(`ffmpeg -f rawvideo -pix_fmt rgba -s 720x1280 -i "${outBin}" -vf "crop=220:280:500:1000" -y "${outPng}"`);
console.log('Saved test_cropped.png');
