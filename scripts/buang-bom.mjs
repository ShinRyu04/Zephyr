/**
 * buang-bom.mjs - hapus BOM yang tidak sengaja ditambahkan PowerShell.
 *
 *   node scripts/buang-bom.mjs
 *
 * `Set-Content -Encoding UTF8` di Windows PowerShell 5.1 menulis BOM di awal
 * berkas, dan berkas catatan rilis ini sebelumnya tidak ber-BOM. BOM yang
 * muncul begitu saja adalah perubahan tak sengaja: ia mengubah byte pertama
 * setiap berkas, terlihat sebagai "seluruh berkas berubah" di diff, dan pada
 * tool yang tidak mengharapkannya justru menjadi karakter tersembunyi di
 * baris pertama.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'D:/Zephyr/release/1.1.13/notes';
let n = 0;
for (const nama of readdirSync(dir)) {
  if (!nama.endsWith('.md')) continue;
  const jalur = join(dir, nama);
  const isi = readFileSync(jalur, 'utf8');
  if (isi.charCodeAt(0) !== 0xfeff) continue;
  writeFileSync(jalur, isi.slice(1), { encoding: 'utf8' });
  n += 1;
  console.log(`  ${nama}: BOM dibuang`);
}
console.log(`\n${n} berkas dibersihkan.`);
