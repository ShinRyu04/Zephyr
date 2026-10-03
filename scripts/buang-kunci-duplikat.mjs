/**
 * buang-kunci-duplikat.mjs - menyingkirkan entri yang tertulis dua kali.
 *
 *   node scripts/buang-kunci-duplikat.mjs
 *
 * Penyebabnya: penyaring "sudah ada?" di `tambah-kunci-bocor.mjs` hanya
 * memeriksa penulisan `"kunci":` (JSON.stringify selalu memberi kutip GANDA),
 * sedangkan kamus ini sebagian memakai kutip TUNGGAL. Kunci yang sudah ada
 * dalam bentuk kutip tunggal karena itu dianggap belum ada dan ditambahkan
 * lagi - dan TypeScript menolak objek dengan properti kembar (TS1117).
 *
 * Berkas ini menyimpan kemunculan PERTAMA setiap kunci dan membuang sisanya.
 * Yang pertama dipertahankan karena itu entri asli; yang belakangan adalah
 * tambahan dari skrip.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const berkas = process.argv[2] || 'D:/Zephyr/src/lib/i18n-extra.ts';
const baris = readFileSync(berkas, 'utf8').split('\n');

const penandaBlok = /^const ([A-Z]{2}): Dict = \{/;
/* Baris entri: `  'kunci': nilai,` atau `  "kunci": nilai,` */
const barisEntri = /^\s+(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*:/;

let blokKini = null;
const terlihat = new Map();
const keluaran = [];
let dibuang = 0;

for (const b of baris) {
  const mBlok = b.match(penandaBlok);
  if (mBlok) {
    blokKini = mBlok[1];
    terlihat.set(blokKini, new Set());
    keluaran.push(b);
    continue;
  }
  /* Blok berakhir. */
  if (/^\};/.test(b)) {
    blokKini = null;
    keluaran.push(b);
    continue;
  }
  const mEntri = b.match(barisEntri);
  if (blokKini && mEntri) {
    const kunci = mEntri[2];
    const ada = terlihat.get(blokKini);
    if (ada.has(kunci)) {
      dibuang += 1;
      continue;
    }
    ada.add(kunci);
  }
  keluaran.push(b);
}

writeFileSync(berkas, keluaran.join('\n'), { encoding: 'utf8' });
console.log(`Baris dibuang: ${dibuang}`);
for (const [nama, set] of terlihat) console.log(`  ${nama}: ${set.size} kunci unik`);
