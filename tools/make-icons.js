// Draws the app icon from the club's logo (app/img/logo.png, the see-through helmet logo from cybercolizeum.bg)
// on black with a soft ice-cyan glow, and writes the PNG sizes iPhone and Android need.
// No dependencies: PNGs are read and written by hand with Node's zlib.  Run: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOGO = path.join(__dirname, '..', 'app', 'img', 'logo.png');
const OUT = path.join(__dirname, '..', 'app', 'icons');
// New names whenever the picture changes: iPhone keeps a Home Screen icon by its file name.
const SIZES = { 'logo-180.png': 180, 'logo-192.png': 192, 'logo-512.png': 512 };
const LOGO_WIDTH = 0.78; // share of the icon; keeps the round logo inside Android's "maskable" safe circle

const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const BG = hex('#040507');
const GLOW = hex('#0d3a44');
const VIOLET = hex('#1b1240');

// ---- Reading a PNG: 8-bit, not interlaced; greyscale, RGB, palette (with tRNS), grey+alpha or RGBA ----

function decodePNG(buf) {
  let pos = 8;
  let width, height, depth, type, interlace;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`Unsupported PNG (bit depth ${depth}, interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r, g, b, al = 255;
    if (type === 3) {
      const idx = pixels[i];
      [r, g, b] = [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]];
      if (trns && idx < trns.length) al = trns[idx];
    } else if (type === 2 || type === 6) {
      [r, g, b] = [pixels[i * channels], pixels[i * channels + 1], pixels[i * channels + 2]];
      if (type === 6) al = pixels[i * 4 + 3];
    } else {
      r = g = b = pixels[i * channels];
      if (type === 4) al = pixels[i * 2 + 1];
    }
    rgba.set([r, g, b, al], i * 4);
  }
  return { width, height, rgba };
}

const logo = decodePNG(fs.readFileSync(LOGO));

/** The logo's colour and opacity at (x, y) in logo pixels, blended between the 4 nearest pixels. */
function logoAt(x, y) {
  if (x < 0 || y < 0 || x > logo.width - 1 || y > logo.height - 1) return [0, 0, 0, 0];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, logo.width - 1);
  const y1 = Math.min(y0 + 1, logo.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const out = [0, 0, 0, 0];
  for (const [px, py, w] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]) {
    const o = (py * logo.width + px) * 4;
    const al = logo.rgba[o + 3] / 255;
    out[0] += logo.rgba[o] * al * w; // premultiplied, so see-through edges don't darken
    out[1] += logo.rgba[o + 1] * al * w;
    out[2] += logo.rgba[o + 2] * al * w;
    out[3] += al * w;
  }
  return out;
}

// Colour of the icon at (u, v), both 0..1 from the top-left corner.
function sample(u, v) {
  const centre = Math.hypot(u - 0.5, v - 0.5);
  let c = BG.map((x, i) => mix(x, GLOW[i], Math.max(0, 1 - centre / 0.62) ** 2 * 0.85));
  c = c.map((x, i) => mix(x, VIOLET[i], Math.max(0, 1 - Math.hypot(u - 0.08, v - 1) / 0.55) ** 2 * 0.5));
  const scale = logo.width / LOGO_WIDTH; // logo pixels per icon width
  const [lr, lg, lb, la] = logoAt((u - 0.5) * scale + logo.width / 2, (v - 0.5) * scale + logo.height / 2);
  return [lr + c[0] * (1 - la), lg + c[1] * (1 - la), lb + c[2] * (1 - la)];
}

function render(size) {
  const SS = Math.max(4, Math.ceil((logo.width / LOGO_WIDTH / size) * 1.5)); // enough samples to shrink the logo cleanly
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
