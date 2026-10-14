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

const KUNCI = /^\s{2}('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/gm;

const kamus = {};
for (let i = 0; i < batas.length; i++) {
  const a = i + 1 < batas.length ? batas[i + 1].i : teks.length;
  const blok = teks.slice(batas[i].i, a);
  // Kunci boleh ditulis dengan kutip tunggal ATAU kutip ganda. Versi lama hanya
  // mengenali kutip tunggal, sehingga kunci ber-kutip ganda tampak "hilang"
  // padahal terjemahannya ada -> laporan palsu. Kedua bentuk sekarang dikenali
  // (isi kunci tetap boleh memuat kutip jenis lain), lalu jenis kutipnya dibuang
  // supaya perbandingan antar kamus tidak tergantung gaya penulisan.
  kamus[batas[i].b] = new Set([...blok.matchAll(KUNCI)].map((m) => m[1].slice(1, -1)));
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
