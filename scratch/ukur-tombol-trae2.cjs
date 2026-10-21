/*
 * Measure TRAE's control geometry, pass 2.
 *
 * Pass 1 looked for 24-60px bright runs and found none, which means the switch
 * track is not a flat bright band — it is dark-on-dark (a grey track on a near
 * black page), so the contrast threshold of 24 was too high. This pass lowers the
 * threshold and reports every run of ANY width on the rows where a control is
 * known to be, so the actual pixel widths can be read instead of assumed.
 */
const fs = require('fs');
const zlib = require('zlib');

function decode(file) {
  const b = fs.readFileSync(file);
  let pos = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString('ascii', pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ct = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const bb = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += bb;
      else if (ft === 3) v += (a + bb) >> 1;
      else if (ft === 4) {
        const p = a + bb - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - bb);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, bpp, px: out };
}

const px = (m, x, y) => {
  const i = y * m.w * m.bpp + x * m.bpp;
  return [m.px[i], m.px[i + 1], m.px[i + 2]];
};

/*
 * Report every distinct colour band across a row. A switch track shows up as a
 * band of one colour ~30px wide sitting to the RIGHT of its label text.
 */
function bands(m, y) {
  const out = [];
  let start = 0;
  let warna = px(m, 0, y).join(',');
  for (let x = 1; x <= m.w; x++) {
    const w2 = x < m.w ? px(m, x, y).join(',') : null;
    if (w2 !== warna) {
      if (x - start >= 12) out.push({ x0: start, x1: x - 1, w: x - start, c: warna });
      start = x;
      warna = w2;
    }
  }
  return out;
}

const DIR = 'C:/Users/Zyrex/Pictures/Screenshots/';
const m = decode(DIR + 'Screenshot 2026-10-19 080609.png');
console.log(`gambar ${m.w}x${m.h}`);

/* Rows chosen from the OCR: 136 is the IDE row of To-Do List, 174 the SOLO row. */
for (const y of [136, 174, 338, 376, 511, 548, 691, 741, 997]) {
  console.log(`\n--- y=${y} ---`);
  const b = bands(m, y).filter((r) => r.w >= 12 && r.w <= 120);
  b.forEach((r) => console.log(`   x${String(r.x0).padStart(4)}-${String(r.x1).padStart(4)}  w=${String(r.w).padStart(3)}  ${r.c}`));
}
