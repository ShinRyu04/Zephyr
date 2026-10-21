/*
 * Measure the EXACT geometry of TRAE's switches and dropdowns from the pixels.
 *
 * The OCR pass gave text positions, which is enough for spacing but not for the
 * controls themselves — a toggle's track, its dot, and the gap to its label are
 * shapes, not text. This decodes the PNG and reports, for each section, the
 * horizontal bands of non-background pixels on the row where the controls sit.
 * That is how "where is the IDE toggle and how wide is its track" gets answered
 * with a number instead of an opinion.
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
const lum = (m, x, y) => {
  const [r, g, b] = px(m, x, y);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/* Background is whatever colour dominates the top-left corner. */
const bgOf = (m) => px(m, 4, 4).join(',');

/*
 * Find horizontal runs of pixels that differ from the background on one row.
 * A switch's track is a bright run ~30px wide; its label is a run of thin
 * strokes. Reporting both lets the two be told apart by width.
 */
function runs(m, y, bg) {
  const out = [];
  let start = -1;
  for (let x = 0; x < m.w; x++) {
    const [r, g, b] = px(m, x, y);
    const beda = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 24;
    if (beda && start < 0) start = x;
    else if (!beda && start >= 0) {
      if (x - start >= 3) out.push([start, x - 1, x - start]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, m.w - 1, m.w - start]);
  return out;
}

const DIR = 'C:/Users/Zyrex/Pictures/Screenshots/';
const FILES = [
  ['Screenshot 2026-10-19 080609.png', 'halaman penuh'],
  ['Screenshot 2026-10-19 080623.png', 'bagian bawah'],
];

for (const [f, label] of FILES) {
  const m = decode(DIR + f);
  const bg = bgOf(m);
  console.log(`\n######## ${f} (${m.w}x${m.h}) — ${label}`);
  console.log(`background: ${bg}`);

  /* Scan rows and report the ones with a wide bright run: those are switches. */
  let dilapor = 0;
  for (let y = 20; y < m.h && dilapor < 14; y += 2) {
    const rs = runs(m, y, bg);
    const lebar = rs.filter((r) => r[2] >= 24 && r[2] <= 60);
    if (lebar.length > 0) {
      console.log(`  y=${String(y).padStart(4)}  run lebar: ${lebar.map((r) => `x${r[0]}-${r[1]}(${r[2]})`).join(' ')}`);
      dilapor++;
      y += 10; /* skip the rest of this control's height */
    }
  }
}
