/*
 * Mencari kunci yang HILANG dari SEBUAH kamus, memakai kamus dengan kunci
 * terbanyak sebagai acuan.
 *
 * Kenapa berkas terpisah: `cek-kunci-i18n-10-kamus.mjs` memeriksa i18n.ts, dan
 * jumlah di sana memang seragam. Yang TIDAK seragam ternyata di i18n-extra.ts,
 * jadi pemeriksaannya harus dijalankan pada berkas itu.
 *
 * Peringatan yang penting: kamus EN memang wajar lebih pendek. Untuk kunci yang
 * teks sumbernya sudah Inggris, tidak perlu ada entri EN - `translate()`
 * mengembalikan kuncinya apa adanya. Jadi selisih di EN BUKAN bug, dan skrip ini
 * melaporkannya terpisah supaya tidak tercampur dengan kekurangan yang nyata.
 */

import { readFileSync } from 'node:fs';

const teks = readFileSync('src/lib/i18n-extra.ts', 'utf8');
const batas = [...teks.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  b: m[1],
  i: m.index,
}));

const kamus = {};
for (let i = 0; i < batas.length; i++) {
  const a = i + 1 < batas.length ? batas[i + 1].i : teks.length;
  const blok = teks.slice(batas[i].i, a);
  kamus[batas[i].b] = new Set([...blok.matchAll(/^\s{2}'(?:[^'\\]|\\.)*'\s*:/gm)].map((m) => m[0].trim()));
}

const bahasa = Object.keys(kamus);
const terbanyak = bahasa.reduce((a, b) => (kamus[a].size >= kamus[b].size ? a : b));
const acuan = kamus[terbanyak];
console.log('Acuan: ' + terbanyak + ' (' + acuan.size + ' kunci)');
console.log('');

for (const b of bahasa) {
  if (b === terbanyak) continue;
  const kurang = [...acuan].filter((k) => !kamus[b].has(k));
  if (!kurang.length) {
    console.log(b + ': lengkap');
    continue;
  }
  const label = b === 'EN' ? ' [EN - wajar lebih pendek, kunci Inggris tidak perlu entri]' : ' [PERIKSA]';
  console.log(b + ': kurang ' + kurang.length + label);
  for (const k of kurang.slice(0, 14)) console.log('    ' + k.slice(0, 95));
  if (kurang.length > 14) console.log('    ... dan ' + (kurang.length - 14) + ' lagi');
  console.log('');
}
