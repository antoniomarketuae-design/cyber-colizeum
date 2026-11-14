// Draws the app icon (a 3 × 3 grid of PC seats on black, three glowing ice-cyan = free) and writes the PNG sizes
// iPhone and Android need. A placeholder until the owner sends the club's logo file.
// No dependencies: the PNG is encoded by hand with Node's zlib.  Run: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'app', 'icons');
const SIZES = { 'icon-180.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const BG = hex('#040507');
const BG_GLOW = hex('#0c2d36');
const VIOLET = hex('#1b1240');
const BUSY = hex('#161b23');
const BUSY_EDGE = hex('#262d38');
const FREE = hex('#7deaf3');
const GLOW = hex('#4fe0ee');

const CELL = 0.17;
const GAP = 0.045;
const START = 0.2;
const RADIUS = 0.035;
const FREE_CELLS = new Set(['0,2', '1,1', '2,1']); // row,col

/** Signed distance from (u, v) to a rounded square centred at (cx, cy); negative inside. */
function roundedBox(u, v, cx, cy) {
  const h = CELL / 2 - RADIUS;
  const dx = Math.max(Math.abs(u - cx) - h, 0);
  const dy = Math.max(Math.abs(v - cy) - h, 0);
  return Math.hypot(dx, dy) - RADIUS;
}

// Colour of the icon at (u, v), both 0..1 from the top-left corner.
function sample(u, v) {
  const centre = Math.hypot(u - 0.5, v - 0.42);
  let c = BG.map((x, i) => mix(x, BG_GLOW[i], Math.max(0, 1 - centre / 0.75) ** 2 * 0.9));
  c = c.map((x, i) => mix(x, VIOLET[i], Math.max(0, 1 - Math.hypot(u - 0.05, v - 1) / 0.6) ** 2 * 0.6));

  let glow = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = START + col * (CELL + GAP) + CELL / 2;
      const cy = START + row * (CELL + GAP) + CELL / 2;
      const d = roundedBox(u, v, cx, cy);
      const free = FREE_CELLS.has(`${row},${col}`);
      if (d < 0) {
        if (free) return FREE;
        return d > -0.012 ? BUSY_EDGE : BUSY;
      }
      if (free && d < 0.08) glow = Math.max(glow, (1 - d / 0.08) ** 2 * 0.65);
    }
  }
  return c.map((x, i) => mix(x, GLOW[i], glow));
}

function render(size) {
  const SS = 4; // 4x4 samples per pixel for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb] = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += cr; g += cg; b += cb;
        }
      }
      const o = (y * size + x) * 4;
      px[o] = Math.round(r / (SS * SS));
      px[o + 1] = Math.round(g / (SS * SS));
      px[o + 2] = Math.round(b / (SS * SS));
      px[o + 3] = 255; // fully opaque: iOS turns transparency black
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of Object.entries(SIZES)) {
  fs.writeFileSync(path.join(OUT, name), encodePNG(size, render(size)));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
