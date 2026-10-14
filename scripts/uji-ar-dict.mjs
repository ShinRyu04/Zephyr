/*
 * Uji kamus AR (src/lib/i18n-extra.ts): ukuran tiap kamus, daftar kunci yang
 * kurang untuk AR (acuan = ID, sama seperti cek-kunci-i18n-extra.mjs),
 * selisih dua arah AR vs tiap bahasa, dan deteksi baris "tempel" (dua pasangan
 * kunci-nilai dalam satu baris, yang terbaca hanya pasangan pertama karena
 * pola pemeriksa berjangkar ^\s{2}).
 */

import { readFileSync } from 'node:fs';

const teks = readFileSync('src/lib/i18n-extra.ts', 'utf8');
const batas = [...teks.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  b: m[1],
  i: m.index,
}));
const KUNCI = /^\s{2}('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/gm;

const kamus = {};
for (let i = 0; i < batas.length; i++) {
  const a = i + 1 < batas.length ? batas[i + 1].i : teks.length;
  kamus[batas[i].b] = new Set(
    [...teks.slice(batas[i].i, a).matchAll(KUNCI)].map((m) => m[1].slice(1, -1)),
  );
}

const ukuran = [];
for (const b of Object.keys(kamus)) ukuran.push(b.padEnd(3) + ' ' + kamus[b].size);
console.log('UKURAN KAMUS:\n' + ukuran.join('\n'));

const ref = 'AR';
console.log('\nSELISIH DUA ARAH (AR vs ...):');
for (const b of Object.keys(kamus)) {
  if (b === ref) continue;
  const tidakAdaDiAR = [...kamus[b]].filter((k) => !kamus[ref].has(k));
  const tidakAdaDiB = [...kamus[ref]].filter((k) => !kamus[b].has(k));
  console.log(
    '  AR vs ' + b + ': ' + b + ' punya ' + tidakAdaDiAR.length + ' kunci yang AR tidak punya; AR punya ' + tidakAdaDiB.length + ' yang ' + b + ' tidak punya',
  );
}

const terbanyak = Object.keys(kamus).reduce((a, b) => (kamus[a].size >= kamus[b].size ? a : b));
const kurang = [...kamus[terbanyak]].filter((k) => !kamus[ref].has(k));
console.log('\nAR kurang terhadap acuan ' + terbanyak + ': ' + kurang.length);
for (const k of kurang) console.log('    ' + k);

// Deteksi baris tempel di seluruh berkas.
let tempel = 0;
const semua = teks.split(/\r?\n/);
for (let i = 0; i < semua.length; i++) {
  const jumlah = [...semua[i].matchAll(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/g)].length;
  if (jumlah > 1) {
    tempel++;
    console.log('TEMPEL baris ' + (i + 1) + ' (' + jumlah + '): ' + semua[i].trim().slice(0, 150));
  }
}
console.log('\nBaris tempel di seluruh berkas: ' + tempel);
