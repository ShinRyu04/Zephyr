// isi-i18n2.mjs — suntikkan terjemahan-i18n.mjs ke i18n-extra.ts.
//
// Setiap kunci ditambahkan ke SEPULUH kamus bahasa. Kunci ditulis persis
// seperti teks Indonesia di komponen, karena translate() memakai teks
// Indonesia sebagai kunci pencarian.
//
// Jalankan: node scripts/isi-i18n2.mjs [--periksa]

import fs from 'node:fs';
import { TERJEMAHAN } from './terjemahan-i18n.mjs';

const PERIKSA = process.argv.includes('--periksa');
const BERKAS = 'src/lib/i18n-extra.ts';
const DAFTAR = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];
const KODE = { ID: 'id', EN: 'en', JA: 'ja', KO: 'ko', ZH: 'zh', ES: 'es', FR: 'fr', DE: 'de', PT: 'pt', AR: 'ar' };

const esc = (t) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
let src = fs.readFileSync(BERKAS, 'utf8');

// Posisi awal tiap kamus.
const posisi = {};
for (const lang of DAFTAR) {
  const m = new RegExp(`^const ${lang}: Dict = \\{$`, 'm').exec(src);
  if (!m) throw new Error(`kamus ${lang} tidak ditemukan`);
  posisi[lang] = m.index + m[0].length;
}

// Isi tiap kamus; lewati kunci yang sudah ada.
const ringkas = [];
for (const lang of DAFTAR) {
  const kode = KODE[lang];
  const awal = posisi[lang];
  const akhir = src.indexOf('\n};', awal);
  const isi = src.slice(awal, akhir);
  const baris = [];
  for (const [kunci, padanan] of Object.entries(TERJEMAHAN)) {
    const nilai = kode === 'id' ? kunci : padanan[kode];
    if (!nilai) throw new Error(`padanan ${kode} untuk "${kunci.slice(0, 40)}…" tidak ada`);
    if (isi.includes(`'${esc(kunci)}':`)) continue;
    baris.push(`  '${esc(kunci)}': '${esc(nilai)}',`);
  }
  if (!baris.length) continue;
  src = src.slice(0, awal) + '\n' + baris.join('\n') + src.slice(awal);
  // Geser posisi kamus berikutnya karena berkas bertambah panjang.
  const tambahan = baris.join('\n').length + 1;
  for (const lain of DAFTAR) if (posisi[lain] > awal) posisi[lain] += tambahan;
  ringkas.push(`${lang}+${baris.length}`);
}

console.log(`# kunci: ${Object.keys(TERJEMAHAN).length}`);
console.log('  ' + (ringkas.join(' ') || 'semua sudah ada'));

if (PERIKSA) {
  console.log('\n(mode --periksa: berkas tidak diubah)');
  process.exit(0);
}

fs.writeFileSync(BERKAS, src);
console.log(`\n  ${BERKAS} diperbarui`);
