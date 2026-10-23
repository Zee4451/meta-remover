/**
 * Fixture Generator for GhostMeta AI Automated Testing
 * Generates valid binary test files with real-world AI metadata and provenance headers.
 */

import fs from 'fs';
import path from 'path';

const FIXTURES_DIR = path.resolve('fixtures');
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function calculateCRC32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makePNGChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);

  const crcPayload = Buffer.concat([typeBytes, data]);
  const crc = calculateCRC32(crcPayload);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// 1. Generate PNG Fixture
function generatePNG() {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR: 2x2, 8-bit RGBA (type 6)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(2, 0); // width
  ihdrData.writeUInt32BE(2, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makePNGChunk('IHDR', ihdrData);

  // tEXt chunk: ComfyUI workflow
  const textPayload = Buffer.from('workflow\x00{"generator":"ComfyUI","nodes":[{"type":"KSampler","inputs":{"seed":12345}}]}');
  const textChunk = makePNGChunk('tEXt', textPayload);

  // iTXt chunk: Google SynthID & trainedAlgorithmicMedia XMP
  const itxtPayload = Buffer.from('XML:com.adobe.xmp\x00\x00\x00\x00\x00<x:xmpmeta><rdf:RDF><rdf:Description DigitalSourceType="trainedAlgorithmicMedia" Software="Google SynthID Provenance"/></rdf:RDF></x:xmpmeta>');
  const itxtChunk = makePNGChunk('iTXt', itxtPayload);

  // caBX chunk: C2PA box
  const c2paPayload = Buffer.from('c2pa content credentials manifest: claim_generator=ComfyUI-C2PA-Plugin');
  const cabxChunk = makePNGChunk('caBX', c2paPayload);

  // IDAT: minimal 2x2 RGBA compressed scanlines (zlib stream)
  // Raw scanlines: 2 rows of: filter_byte (0) + 2 pixels * 4 bytes = 9 bytes/row = 18 bytes
  // Zlib uncompressed block: 78 01 01 12 00 ED FF followed by 18 bytes and Adler32
  const uncompressedScanlines = Buffer.alloc(18, 0xFF);
  uncompressedScanlines[0] = 0; // filter row 1
  uncompressedScanlines[9] = 0; // filter row 2
  // Zlib header (0x78, 0x01), non-compressed block header: 0x01 (BFINAL=1, BTYPE=00), len=18 (0x0012), nlen=~18 (0xFFED)
  const zlibHeader = Buffer.from([0x78, 0x01, 0x01, 0x12, 0x00, 0xED, 0xFF]);
  // Adler32 of uncompressedScanlines
  let a = 1, b = 0;
  for (let i = 0; i < uncompressedScanlines.length; i++) {
    a = (a + uncompressedScanlines[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0, 0);

  const idatData = Buffer.concat([zlibHeader, uncompressedScanlines, adler]);
  const idatChunk = makePNGChunk('IDAT', idatData);

  // IEND chunk
  const iendChunk = makePNGChunk('IEND', Buffer.alloc(0));

  const pngFile = Buffer.concat([signature, ihdrChunk, textChunk, itxtChunk, cabxChunk, idatChunk, iendChunk]);
  const filePath = path.join(FIXTURES_DIR, 'test-comfyui-synthid.png');
  fs.writeFileSync(filePath, pngFile);
  console.log(`[Fixture] Created PNG: ${filePath} (${pngFile.length} bytes)`);
}

// 2. Generate JPEG Fixture
function generateJPEG() {
  function makeMarker(markerByte, payload) {
    const marker = Buffer.alloc(4 + payload.length);
    marker[0] = 0xFF;
    marker[1] = markerByte;
    marker.writeUInt16BE(payload.length + 2, 2);
    payload.copy(marker, 4);
    return marker;
  }

  // APP1: EXIF with GPS coordinates
  const exifHeader = Buffer.from('Exif\x00\x00II*\x00\x08\x00\x00\x00'); // Little-endian TIFF
  const exifBody = Buffer.alloc(32);
  exifBody.writeUInt16LE(1, 0); // 1 IFD tag
  exifBody.writeUInt16LE(0x8825, 2); // GPSInfo tag
  exifBody.writeUInt16LE(4, 4); // LONG type
  exifBody.writeUInt32LE(1, 6); // count
  exifBody.writeUInt32LE(26, 10); // offset to GPS data
  const gpsString = Buffer.from('GPSLatitude:37.7749N,GPSLongitude:122.4194W\x00');
  const app1Payload = Buffer.concat([exifHeader, exifBody, gpsString]);
  const app1 = makeMarker(0xE1, app1Payload);

  // APP11: C2PA JUMBF Box
  const app11Payload = Buffer.from('JPUM\x00c2pa.claim\x00urn:c2pa:OpenAI:DALL-E-3:Signature=sha256:d41d8cd98f00b204e9800998ecf8427e');
  const app11 = makeMarker(0xEB, app11Payload);

  // APP13: IPTC with trainedAlgorithmicMedia
  const app13Payload = Buffer.from('Photoshop 3.0\x008BIM\x04\x04\x00\x00\x00\x00\x00\x30http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia');
  const app13 = makeMarker(0xED, app13Payload);

  // Fully compliant baseline 1x1 JPEG template
  const valid1x1Jpeg = Buffer.from([
    0xFF, 0xD8, // SOI
    0xFF, 0xDB, 0x00, 0x43, 0x00,
    0x03, 0x02, 0x02, 0x03, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x04, 0x03, 0x03, 0x04, 0x05, 0x08,
    0x05, 0x05, 0x04, 0x04, 0x05, 0x0A, 0x07, 0x07, 0x06, 0x08, 0x0C, 0x0A, 0x0C, 0x0C, 0x0B, 0x0A,
    0x0B, 0x0B, 0x0D, 0x0E, 0x12, 0x10, 0x0D, 0x0E, 0x11, 0x0E, 0x0B, 0x0B, 0x10, 0x16, 0x10, 0x11,
    0x13, 0x14, 0x15, 0x15, 0x15, 0x0C, 0x0F, 0x17, 0x18, 0x16, 0x14, 0x18, 0x12, 0x14, 0x15, 0x14,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
    0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04,
    0x04, 0x00, 0x00, 0x01, 0x7D, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41,
    0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08, 0x23, 0x42, 0xB1,
    0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19,
    0x1A, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44,
    0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64,
    0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84,
    0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2,
    0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9,
    0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7,
    0xD8, 0xD9, 0xDA, 0xE1, 0xE2, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3,
    0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA,
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
    0x7F, 0x00,
    0xFF, 0xD9 // EOI
  ]);

  // Splice metadata right after SOI (bytes 0-1)
  const jpegFile = Buffer.concat([
    valid1x1Jpeg.slice(0, 2),
    app1,
    app11,
    app13,
    valid1x1Jpeg.slice(2)
  ]);

  const filePath = path.join(FIXTURES_DIR, 'test-gps-c2pa.jpg');
  fs.writeFileSync(filePath, jpegFile);
  console.log(`[Fixture] Created JPEG: ${filePath} (${jpegFile.length} bytes)`);
}

// 3. Generate MP4 Fixture
function generateMP4() {
  function makeBox(type, payload) {
    const box = Buffer.alloc(8 + payload.length);
    box.writeUInt32BE(8 + payload.length, 0);
    box.write(type, 4, 4, 'ascii');
    payload.copy(box, 8);
    return box;
  }

  // ftyp box
  const ftypPayload = Buffer.from([
    0x69, 0x73, 0x6F, 0x6D, // isom
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6F, 0x6D, 0x6D, 0x70, 0x34, 0x32 // brands
  ]);
  const ftyp = makeBox('ftyp', ftypPayload);

  // uuid box: C2PA standard UUID (d8fec3d6-1b0e-483c-9297-5828877aae48)
  const uuidHeader = Buffer.from([
    0xD8, 0xFE, 0xC3, 0xD6, 0x1B, 0x0E, 0x48, 0x3C,
    0x92, 0x97, 0x58, 0x28, 0x87, 0x7A, 0xAE, 0x48
  ]);
  const uuidData = Buffer.from('urn:c2pa:RunwayML:Gen-3:claim:OpenAI:Sora:c2pa-manifest-data-block');
  const uuid = makeBox('uuid', Buffer.concat([uuidHeader, uuidData]));

  // moov with mvhd and udta
  const mvhdData = Buffer.alloc(100, 0);
  const mvhd = makeBox('mvhd', mvhdData);

  const udtaData = Buffer.from('udta User Data: Generated with OpenAI Sora & Runway Gen-3 Alpha model.');
  const udta = makeBox('udta', udtaData);

  const moov = makeBox('moov', Buffer.concat([mvhd, udta]));

  // mdat box
  const mdat = makeBox('mdat', Buffer.from([0x00, 0x00, 0x01, 0xB6, 0x10, 0x20, 0x30, 0x40]));

  const mp4File = Buffer.concat([ftyp, uuid, moov, mdat]);
  const filePath = path.join(FIXTURES_DIR, 'test-sora-runway-c2pa.mp4');
  fs.writeFileSync(filePath, mp4File);
  console.log(`[Fixture] Created MP4: ${filePath} (${mp4File.length} bytes)`);
}

generatePNG();
generateJPEG();
generateMP4();
console.log('All test fixtures generated successfully!');
