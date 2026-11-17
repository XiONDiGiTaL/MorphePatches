/**
 * Generates the PWA icon set with no image dependencies: a near-black field, a
 * blue gradient tile on the brand accent, and a dark waveform glyph.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public');
mkdirSync(outDir, { recursive: true });

const BG = [5, 6, 7];
const ACCENT = [63, 128, 255];
const ACCENT_HI = [121, 168, 255];
const GLYPH = [4, 7, 15];

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePng(size, pixels) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    pixels.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

function render(size, contentScale) {
  const pixels = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const half = (size * contentScale) / 2;
  const radius = half * 0.44;

  // Five bars, tallest in the middle: a voicemail waveform.
  const barWidth = half * 0.12;
  const barGap = half * 0.09;
  const heights = [0.42, 0.72, 1, 0.72, 0.42];
  const bars = heights.map((factor, index) => {
    const offset = (index - (heights.length - 1) / 2) * (barWidth * 2 + barGap);
    return {
      x: centre + offset,
      halfW: barWidth,
      halfH: half * 0.52 * factor,
    };
  });

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let colour = BG;

      const tile = clamp01(0.5 - sdRoundRect(px, py, centre, centre, half, half, radius));
      if (tile > 0) {
        const gradient = clamp01((py - (centre - half)) / (half * 2));
        colour = mix(colour, mix(ACCENT_HI, ACCENT, gradient), tile);
      }

      for (const bar of bars) {
        const coverage = clamp01(0.5 - sdRoundRect(px, py, bar.x, centre, bar.halfW, bar.halfH, bar.halfW));
        if (coverage > 0) colour = mix(colour, GLYPH, coverage);
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

const targets = [
  { file: 'icon-192.png', size: 192, scale: 0.82 },
  { file: 'icon-512.png', size: 512, scale: 0.82 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.6 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.82 },
];

for (const target of targets) {
  const png = encodePng(target.size, render(target.size, target.scale));
  writeFileSync(resolve(outDir, target.file), png);
  console.log(`wrote public/${target.file} (${png.length} bytes)`);
}
