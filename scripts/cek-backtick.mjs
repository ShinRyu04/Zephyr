/*
 * Mencari backtick yang berada DI DALAM template literal.
 *
 * Ini jebakan yang sudah tiga kali terkena di proyek ini: satu backtick di
 * komentar yang terletak di dalam template literal menutup string itu lebih
 * awal, dan parser melaporkan error di baris LAIN - sehingga penyebabnya sulit
 * dilihat dan waktunya habis untuk menebak.
 *
 * Cara kerjanya: hitung backtick per baris. Baris dengan jumlah GANJIL membuka
 * atau menutup template. Backtick yang muncul saat kita SUDAH di dalam template
 * adalah pelanggaran, kecuali baris itu sendiri yang menutupnya.
 */

import { readFileSync } from 'node:fs';

const berkas = process.argv[2];
if (!berkas) {
  /*
   * Ini ALAT, bukan uji. Tanpa argumen tidak ada berkas yang diperiksa, jadi
   * tidak ada putusan yang sah: di berkas ini 2 berarti "ada backtick
   * bermasalah" dan 1 akan terbaca sebagai uji gagal - dua-duanya salah di
   * sini. Karena itu keluarannya 0, dengan spanduk BUKAN UJI supaya tidak
   * terbaca sebagai "bersih".
   */
  console.error('BUKAN UJI (alat): butuh argumen <berkas>, tidak ada yang diperiksa.');
  console.error('pakai: node scripts/cek-backtick.mjs <berkas>');
  process.exit(0);
}

const baris = readFileSync(berkas, 'utf8').split('\n');
let dalam = false;
const masalah = [];

for (let i = 0; i < baris.length; i++) {
  const l = baris[i];
  const n = [...l].filter((c) => c === '`').length;

  if (n === 0) continue;

  /* Ganjil: baris ini mengubah status template. */
  if (n % 2 === 1) {
    dalam = !dalam;
    continue;
  }

  /* Genap dan bukan nol: kalau kita SEDANG di dalam template, baris ini memuat
     backtick yang tidak seharusnya ada di sana. */
  if (dalam) masalah.push(i + 1 + ': ' + l.trim().slice(0, 120));
}

console.log(berkas);
if (dalam) console.log('  PERINGATAN: template literal tidak tertutup di akhir berkas');
if (!masalah.length) {
  console.log('  bersih: tidak ada backtick di dalam template literal');
  process.exit(0);
}
console.log('  ' + masalah.length + ' baris bermasalah:');
for (const m of masalah) console.log('    ' + m);
process.exit(2);
