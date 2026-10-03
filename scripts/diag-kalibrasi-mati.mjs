/*
 * Kalibrasi: apakah cara mendeteksi "kunci mati" itu benar.
 *
 * Detektor yang melaporkan SEMUA kunci mati lebih mungkin salah daripada benar.
 * Jadi ia diuji dengan kunci yang SUDAH PASTI dipakai - kalau kunci yang jelas
 * dipakai juga dilaporkan mati, maka detektornya yang rusak, bukan kamusnya.
 *
 * Ada dua cara sebuah kunci dipakai, dan detektor harus mengenali keduanya:
 *   1. tr('kalimat')            - langsung, apa adanya
 *   2. tr(p.nama)               - lewat variabel, sehingga kalimatnya hanya
 *                                 muncul sebagai NILAI di berkas lain
 * Kasus 2 inilah yang membuat "kunci mati" mudah salah lapor.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function berkasSumber(d, keluaran = []) {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) berkasSumber(p, keluaran);
    else if (/\.(tsx|ts)$/.test(f.name)) keluaran.push(p);
  }
  return keluaran;
}

const PENGECUALIAN = ['i18n-extra.ts', 'i18n.ts', 'i18n-src.ts', 'devBridge.ts'];
const semua = berkasSumber('src');

function pemakai(kunci) {
  const out = [];
  for (const b of semua) {
    if (PENGECUALIAN.some((p) => b.endsWith(p))) continue;
    if (readFileSync(b, 'utf8').includes(kunci)) out.push(b);
  }
  return out;
}

/* Kontrol POSITIF: kunci yang pasti tampil di UI. Kalau ini dilaporkan mati,
   detektornya salah dan semua kesimpulan sebelumnya batal. */
const PASTI_DIPAKAI = [
  'Language Servers',
  'Re-check',
  'No server matches that filter.',
  'Enabled',
];

console.log('--- kontrol positif (harus DIPAKAI) ---');
let gagal = 0;
for (const k of PASTI_DIPAKAI) {
  const p = pemakai(k);
  if (!p.length) gagal += 1;
  console.log((p.length ? 'DIPAKAI ' : 'MATI    ') + k);
}

console.log('\n--- kandidat kunci mati ---');
const KANDIDAT = [
  'Tool yang dikenalkan ke model',
  'Panjang prompt sekarang',
  'Sembunyikan pratinjau',
  'Persona: identitas',
];
for (const k of KANDIDAT) {
  const p = pemakai(k);
  console.log((p.length ? 'DIPAKAI ' : 'MATI    ') + k);
}

console.log('\nKesimpulan: ' + (gagal === 0
  ? 'detektor SAH - kontrol positif terbaca dipakai, jadi MATI di atas bisa dipercaya.'
  : 'detektor RUSAK - ' + gagal + ' kunci yang jelas dipakai terbaca mati. Jangan pakai hasilnya.'));

/* Bentuk pemakaian yang lolos dari deteksi ini, supaya batasnya jelas. */
console.log('\nYang TIDAK bisa dideteksi dengan cara ini:');
console.log('  - kunci yang dirakit dari variabel, mis. tr(`${a} ${b}`)');
console.log('  - kunci yang datang dari data (persona, subagent, tool) - kalimatnya');
console.log('    hanya muncul sebagai NILAI di berkas lain, bukan sebagai tr(...)');
