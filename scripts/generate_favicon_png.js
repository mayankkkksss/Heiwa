import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate a crisp 32x32 PNG cherry blossom flower favicon
const width = 32;
const height = 32;
const buffer = Buffer.alloc(width * height * 4); // RGBA

function setPixel(x, y, r, g, b, a) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  const srcA = a / 255;
  const dstA = buffer[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    buffer[idx] = Math.round((r * srcA + buffer[idx] * dstA * (1 - srcA)) / outA);
    buffer[idx + 1] = Math.round((g * srcA + buffer[idx + 1] * dstA * (1 - srcA)) / outA);
    buffer[idx + 2] = Math.round((b * srcA + buffer[idx + 2] * dstA * (1 - srcA)) / outA);
    buffer[idx + 3] = Math.round(outA * 255);
  }
}

function fillCircle(cx, cy, radius, r, g, b, a = 255) {
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= radius) {
        const edge = radius - dist;
        const alpha = edge < 1 ? Math.round(a * edge) : a;
        setPixel(x, y, r, g, b, alpha);
      }
    }
  }
}

const cx = 16;
const cy = 16;

// Check if point (x, y) is inside a 5-petal sakura flower
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy);
    if (r === 0) continue;
    let angle = Math.atan2(dy, dx) - Math.PI / 2; // top is 0
    if (angle < 0) angle += Math.PI * 2;

    // Petal angle normalized to [-PI/5, PI/5]
    const petalAngle = ((angle % (Math.PI * 2 / 5)) - Math.PI / 5);
    
    // Sakura petal shape radius function with split tip notch
    const baseRadius = 12.8;
    const shape = Math.cos(petalAngle * 2.5); // petal width
    const notch = 1.0 - 0.22 * Math.exp(-Math.pow(petalAngle * 7.5, 2)); // center tip notch
    const maxR = baseRadius * (0.35 + 0.65 * Math.max(0, shape)) * notch;

    if (r <= maxR) {
      const edge = maxR - r;
      const alpha = edge < 0.8 ? Math.round(255 * (edge / 0.8)) : 255;
      const t = r / maxR; // 0 at center, 1 at edge
      
      // Soft Sakura gradient: Deep rose-pink at center to pastel white-pink at petal tips
      const red = Math.round(255);
      const green = Math.round(117 + t * 125);
      const blue = Math.round(143 + t * 105);
      
      setPixel(x, y, red, green, blue, alpha);
    }
  }
}

// Center Glow (Darker coral rose)
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    const dist = Math.hypot(x - cx, y - cy);
    if (dist <= 5.5) {
      const factor = 1 - (dist / 5.5);
      setPixel(x, y, 244, 63, 94, Math.round(180 * factor));
    }
  }
}

// 5 Main Stamens
for (let i = 0; i < 5; i++) {
  const theta = (i * 72 - 90) * (Math.PI / 180);
  const sx = cx + Math.cos(theta) * 6.5;
  const sy = cy + Math.sin(theta) * 6.5;
  
  // Stamen filament
  const steps = 15;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = cx + (sx - cx) * t;
    const py = cy + (sy - cy) * t;
    fillCircle(px, py, 0.45, 225, 29, 72, 220);
  }
  
  // Golden pollen anther
  fillCircle(sx, sy, 0.95, 251, 191, 36, 255);
}

// 5 Intermediate Soft Stamens
for (let i = 0; i < 5; i++) {
  const theta = (i * 72 - 54) * (Math.PI / 180);
  const sx = cx + Math.cos(theta) * 5.2;
  const sy = cy + Math.sin(theta) * 5.2;
  
  const steps = 12;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = cx + (sx - cx) * t;
    const py = cy + (sy - cy) * t;
    fillCircle(px, py, 0.35, 251, 113, 133, 180);
  }
  fillCircle(sx, sy, 0.75, 251, 191, 36, 230);
}

// Core Pistil
fillCircle(cx, cy, 1.4, 225, 29, 72, 255);
fillCircle(cx, cy, 0.7, 251, 191, 36, 255);

// PNG Encoder
function createPNG(width, height, rgbaBuffer) {
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);
  for (let y = 0; y < height; y++) {
    rawData[y * scanlineLength] = 0;
    rgbaBuffer.copy(rawData, y * scanlineLength + 1, y * width * 4, (y + 1) * width * 4);
  }

  const deflated = zlib.deflateSync(rawData);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      let c = (crc ^ buf[i]) & 0xff;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crcVal = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crcVal, 8 + len);
    return buf;
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', deflated),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const pngBuffer = createPNG(width, height, buffer);
const pngPath = path.join(publicDir, 'favicon.png');
fs.writeFileSync(pngPath, pngBuffer);
console.log('✅ Generated public/favicon.png (cherry blossom flower) successfully (' + pngBuffer.length + ' bytes)');
