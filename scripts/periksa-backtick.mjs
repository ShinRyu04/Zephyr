import fs from 'node:fs';

const t = fs.readFileSync('scripts/uji-stack-layout.mjs', 'utf8');
const i = t.indexOf('const timpa');
const j = t.indexOf('if (!timpa.bisaDiperiksa)');
const seg = t.slice(i, j);

const bt = [...seg].filter((c) => c === '`').length;
console.log('jumlah backtick:', bt, '(harus 2)');

const k = seg.indexOf('`');
console.log('200 huruf setelah backtick pertama:');
console.log(JSON.stringify(seg.slice(k, k + 200)));

/* Cari komentar yang mengandung backtick - itu yang menutup template lebih awal. */
const baris = seg.split('\n');
baris.forEach((b, n) => {
  if (b.includes('`') && (b.trim().startsWith('/*') || b.trim().startsWith('*') || b.trim().startsWith('//'))) {
    console.log('BARIS BERMASALAH', n + 1, ':', b.trim());
  }
});
