/**
 * perbarui-catatan-rilis.mjs - sinkronkan angka katalog di catatan rilis 1.1.13.
 *
 *   node scripts/perbarui-catatan-rilis.mjs
 *
 * Catatan rilis 1.1.13 ditulis sebelum tiga tool terminal ditambahkan, jadi ia
 * masih menyebut "51 tool" dan "40 inti" di sepuluh bahasa. Angka yang salah di
 * catatan rilis bukan sekadar teks: ia yang dibaca orang saat memutuskan apakah
 * tool yang dicarinya ada.
 *
 * Penggantian dilakukan pada POLA angka + kata yang mengikutinya, bukan pada
 * kalimat lengkap, karena kesepuluh berkas memakai kalimat yang berbeda-beda -
 * dan mencocokkan kalimatnya satu per satu berarti satu bahasa yang terlewat
 * akan tetap salah tanpa ada yang tahu.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'D:/Zephyr/release/1.1.13/notes';

/* "51 tool" / "51 tools" -> 54; "40 inti"/"40 tools inti" -> 43. */
const POLA = [
  [/\b51\b(?=\s*(?:tool|tools\b|alat))/gi, '54'],
  [/\b40\b(?=\s*(?:inti|yang pertama|perintah inti))/gi, '43'],
  [/\b40 of 51 on\b/g, '43 of 54 on'],
  [/\b26\b(?=\s*(?:bawaan|built-?in|builtin))/gi, '29'],
];

let berkasDiubah = 0;
for (const nama of readdirSync(dir)) {
  if (!nama.endsWith('.md')) continue;
  const jalur = join(dir, nama);
  const asli = readFileSync(jalur, 'utf8');
  let hasil = asli;
  for (const [pola, ganti] of POLA) hasil = hasil.replace(pola, ganti);
  if (hasil === asli) {
    console.log(`  ${nama}: tidak ada angka lama`);
    continue;
  }
  writeFileSync(jalur, hasil, { encoding: 'utf8' });
  berkasDiubah += 1;
  console.log(`  ${nama}: diperbarui`);
}
console.log(`\n${berkasDiubah} berkas diperbarui.`);
