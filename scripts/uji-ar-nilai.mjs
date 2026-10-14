/*
 * Uji nilai kamus AR: cari entri yang nilainya KOSONG, dan semua entri yang
 * memuat kata "snapshot". Dua hal ini yang bisa membuat sebuah kunci terlihat
 * "kurang" walau kuncinya ada.
 */

import { readFileSync } from 'node:fs';

const teks = readFileSync('src/lib/i18n-extra.ts', 'utf8');
const mulai = teks.indexOf('const AR: Dict = {');
const blok = teks.slice(mulai);
const baris = blok.split(/\r?\n/);

let kosong = 0;
let snapshot = 0;
for (let i = 0; i < baris.length; i++) {
  const b = baris[i];
  const m = b.match(/^\s{2}(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,?\s*$/);
  if (m) {
    const kunci = m[1] ?? m[2] ?? '';
    const nilai = m[3] ?? m[4] ?? '';
    if (!nilai) {
      kosong++;
      console.log('NILAI KOSONG (baris ' + (i + 1) + '): ' + kunci.slice(0, 120));
    }
  }
  if (/snapshot/i.test(b)) {
    snapshot++;
    console.log('SNAPSHOT (baris ' + (i + 1) + '): ' + b.trim().slice(0, 160));
  }
}
console.log('\nEntri AR bernilai kosong: ' + kosong);
console.log('Entri AR memuat "snapshot": ' + snapshot);
console.log('Total baris blok AR: ' + baris.length);
