/*
 * Kunci mana yang TIDAK ada di sebagian kamus.
 *
 * Ini pertanyaan yang menentukan untuk keluhan "bahasa campur": kalau sebuah
 * kunci hanya ada di kamus ID, pengguna berbahasa Jepang atau Arab melihat teks
 * Indonesia - bukan karena terjemahannya salah, tapi karena tidak ada. Selisih
 * jumlah kunci saja tidak cukup; yang dibutuhkan NAMA kuncinya supaya bisa
 * ditambahkan.
 *
 * Dibaca dari berkas dengan parser sederhana: setiap kamus adalah satu objek,
 * dan kuncinya duduk di indentasi dua spasi. Nilai yang membentang beberapa
 * baris tidak masalah - yang dicari hanya AWAL baris kunci.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const baris = readFileSync('src/lib/i18n-extra.ts', 'utf8').split('\n');
const KODE = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];

/* Batas setiap kamus. */
const peta = {};
for (let i = 0; i < baris.length; i++) {
  const m = baris[i].match(/^(?:export\s+)?const\s+([A-Z]{2})\s*(?::[^=]+)?=\s*\{/);
  if (m && KODE.includes(m[1])) peta[m[1]] = i;
}

/* Ambil kunci per kamus. Baris kunci selalu mulai dengan tepat dua spasi, lalu
   tanda kutip. Nilai multi-baris juga mulai dengan dua spasi, tapi dibuka dengan
   kunci yang sudah tercatat - jadi cukup baris yang punya pola `'k':`. */
const kunci = {};
for (let i = 0; i < KODE.length; i++) {
  const k = KODE[i];
  if (peta[k] === undefined) continue;
  const mulai = peta[k] + 1;
  const akhir = i + 1 < KODE.length && peta[KODE[i + 1]] !== undefined ? peta[KODE[i + 1]] : baris.length;
  const himpunan = new Set();
  for (let j = mulai; j < akhir; j++) {
    const m = baris[j].match(/^\s{2}(['"])(.*?)\1\s*:/);
    if (m) himpunan.add(m[2]);
  }
  kunci[k] = himpunan;
}

const acuan = kunci.ES;
console.log('Acuan: ES (' + acuan.size + ' kunci)\n');

const laporan = {};
for (const k of KODE) {
  if (!kunci[k]) continue;
  const kurang = [...acuan].filter((x) => !kunci[k].has(x));
  const lebih = [...kunci[k]].filter((x) => !acuan.has(x));
  laporan[k] = { kurang, lebih };
  console.log(k + ': kurang ' + kurang.length + ', lebih ' + lebih.length);
}

/* Yang paling penting: kunci yang hilang di BANYAK kamus sekaligus. Itu kandidat
   terkuat penyebab bahasa campur. */
const hitung = new Map();
for (const k of KODE) {
  if (k === 'ES' || !laporan[k]) continue;
  for (const x of laporan[k].kurang) hitung.set(x, (hitung.get(x) || 0) + 1);
}
const parah = [...hitung.entries()].filter(([, n]) => n >= 8).sort((a, b) => b[1] - a[1]);

console.log('\n--- kunci yang hilang di 8+ bahasa ---');
if (!parah.length) console.log('(tidak ada)');
parah.slice(0, 40).forEach(([x, n]) => console.log('  [' + n + '] ' + x));

writeFileSync('scripts/_laporan-kamus.json', JSON.stringify(laporan, null, 1));
console.log('\nLaporan lengkap: scripts/_laporan-kamus.json');
