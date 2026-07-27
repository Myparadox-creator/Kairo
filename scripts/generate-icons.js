// scripts/generate-icons.js — Generate PNG icons for Kairo extension
// Run with: node scripts/generate-icons.js

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = resolve(__dirname, '..', 'assets', 'icons');

if (!existsSync(ICONS_DIR)) {
  mkdirSync(ICONS_DIR, { recursive: true });
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPNG(size) {
  const width = size;
  const height = size;

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = createChunk('IHDR', ihdrData);

  // Pixel data
  const rawData = [];
  const cx = width / 2;
  const cy = height / 2;
  const R = width / 2;

  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter: none
    for (let x = 0; x < width; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < R - 1) {
        // Inside circle — purple gradient
        const t = dist / R;
        const angle = Math.atan2(dy, dx);
        const grad = (Math.sin(angle * 0.5 + t * 2) + 1) / 2;

        // Lightning bolt area detection (simplified)
        const nx = (x - cx) / R;
        const ny = (y - cy) / R;
        const inBolt = isInBolt(nx, ny);

        if (inBolt) {
          // White lightning bolt
          rawData.push(255, 255, 255, 255);
        } else {
          const r = Math.round(88 + grad * 60);
          const g = Math.round(40 + grad * 50);
          const b = Math.round(220 + grad * 35);
          rawData.push(r, g, b, 255);
        }
      } else if (dist < R) {
        // Anti-alias edge
        const alpha = Math.round(Math.max(0, R - dist) * 255);
        rawData.push(108, 71, 255, alpha);
      } else {
        rawData.push(0, 0, 0, 0);
      }
    }
  }

  const compressed = deflateSync(Buffer.from(rawData));
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Simple lightning bolt shape
function isInBolt(nx, ny) {
  // Bolt: zigzag from top to bottom
  // Normalized coords: -1 to 1
  const points = [
    [0.1, -0.55], // top
    [-0.15, -0.05], // mid-left
    [0.15, -0.05], // mid-right notch
    [-0.1, 0.55], // bottom
  ];

  // Check if point is near the bolt lines
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const d = distToSegment(nx, ny, x1, y1, x2, y2);
    const thickness = 0.08;
    if (d < thickness) return true;
  }
  return false;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const ddx = px - projX;
  const ddy = py - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

// Generate all sizes
for (const size of [16, 48, 128]) {
  const png = createPNG(size);
  const path = resolve(ICONS_DIR, `icon${size}.png`);
  writeFileSync(path, png);
  console.log(`✓ Generated icon${size}.png (${png.length} bytes)`);
}

console.log('\nAll icons generated!');
