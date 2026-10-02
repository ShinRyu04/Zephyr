/**
 * cari-kunci-hilang.mjs - daftar kunci yang ADA di kamus EN tapi TIDAK di kamus lain.
 *
 *   node scripts/cari-kunci-hilang.mjs
 *
 * Dibaca langsung dari berkas, bukan lewat aplikasi, supaya bisa dipakai untuk
 * memperbaiki kamusnya - bukan hanya melaporkan.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const berkas = 'D:/Zephyr/src/lib/i18n-extra.ts';
const isi = readFileSync(berkas, 'utf8');

const blok = {};
const penanda = [...isi.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)];
for (let i = 0; i < penanda.length; i += 1) {
  const mulai = penanda[i].index + penanda[i][0].length;
  const akhir = i + 1 < penanda.length ? penanda[i + 1].index : isi.indexOf('export const EXTRA');
  blok[penanda[i][1]] = isi.slice(mulai, akhir);
}

const entri = (teks) => {
  const peta = new Map();
  for (const m of teks.matchAll(/'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)'/g)) peta.set(m[1], m[2]);
  return peta;
};

const en = entri(blok.EN || '');
const bahasaLain = Object.keys(blok).filter((l) => l !== 'EN' && l !== 'ID');

const laporan = {};
for (const l of bahasaLain) {
  const kamus = entri(blok[l]);
  const hilang = [];
  for (const [k, v] of en) {
    if (!kamus.has(k)) hilang.push([k, v]);
  }
  laporan[l] = hilang;
}

/* Kunci yang hilang di SEMUA bahasa lain - kandidat kuat untuk ditambahkan. */
const diSemua = [...en.keys()].filter((k) => bahasaLain.every((l) => !entri(blok[l]).has(k)));

console.log('== Kunci EN yang tidak ada di bahasa lain ==');
for (const l of bahasaLain) {
  console.log(`  ${l}: ${laporan[l].length} hilang`);
}
console.log(`\n== Hilang di SEMUA ${bahasaLain.length} bahasa: ${diSemua.length} ==`);
for (const k of diSemua.slice(0, 60)) console.log(`  ${JSON.stringify(k)} -> ${JSON.stringify(en.get(k))}`);

writeFileSync(
  'D:/Zephyr/node_modules/.cache/kunci-hilang.json',
  JSON.stringify({ perBahasa: Object.fromEntries(Object.entries(laporan).map(([l, v]) => [l, v.length])), diSemua: diSemua.map((k) => [k, en.get(k)]) }, null, 2),
  'utf8',
);
console.log('\nDaftar lengkap ditulis ke node_modules/.cache/kunci-hilang.json');
