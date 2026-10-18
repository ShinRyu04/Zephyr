// Tulis paket ikon ke src-tauri/src/ext_bundled_extra.rs (idempoten).
//
// Setiap paket WAJIB punya folder / folder-open / folderNames: tanpa ketiganya
// folder di pohon berkas tetap memakai gambar bawaan, dan itu keluhan aslinya
// ("folder-folder nggak berubah sama sekali").
const fs = require('fs');
const paket = JSON.parse(fs.readFileSync('scratch/ikon/paket.json', 'utf8'));

/** Escape untuk raw string Rust r##"..."## - cukup pastikan tidak ada `"##`. */
const aman = (s) => s.split('"##').join('"# #');

const konstanta = [];
for (const p of paket) {
  const nama = 'IKON_' + p.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  konstanta.push(`pub(super) const ${nama}: &str = r##"${aman(p.manifest)}"##;`);
  konstanta.push('');
  konstanta.push(`pub(super) const ${nama}_JSON: &str = r##"${aman(p.json)}"##;`);
  konstanta.push('');
}

const daftar = paket.map((p) => {
  const nama = 'IKON_' + p.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `    (\n        "${p.id}",\n        &[\n            ("zephyr-extension.json", extra::${nama}),\n            ("icons/${p.id.split('ikon-')[1]}.json", extra::${nama}_JSON),\n        ],\n    ),`;
});

let c = fs.readFileSync('src-tauri/src/ext_bundled_extra.rs', 'utf8');
const E = c.includes('\r\n') ? '\r\n' : '\n';

// Hapus blok hasil generator sebelumnya.
const AWAL = '/* ══ IKON MARKETPLACE — DIHASILKAN scratch/gen-tema-marketplace.cjs ══ */';
const AKHIR = '/* ══ AKHIR IKON MARKETPLACE ══ */';
const iA = c.indexOf(AWAL);
if (iA >= 0) {
  const iB = c.indexOf(AKHIR);
  if (iB < 0) throw new Error('penanda akhir tidak ditemukan');
  c = c.slice(0, iA) + c.slice(iB + AKHIR.length);
}

const blok = [
  '',
  AWAL,
  '/*',
  ' * Paket ikon marketplace.',
  ' *',
  ' * Tiap paket mendefinisikan `folder`, `folder-open`, dan `folderNames`, jadi',
  ' * memilihnya benar-benar mengubah ikon FOLDER di pohon berkas - bukan hanya',
  ' * huruf per ekstensi. Itu inti keluhan "folder nggak berubah sama sekali".',
  ' */',
  '',
  ...konstanta,
  AKHIR,
  '',
].join(E);

c = c.trimEnd() + E + blok;
fs.writeFileSync('src-tauri/src/ext_bundled_extra.rs', c, 'utf8');

// Daftarkan di ext_bundled.rs (PAKET_EXTRA).
let b = fs.readFileSync('src-tauri/src/ext_bundled.rs', 'utf8');
const EB = b.includes('\r\n') ? '\r\n' : '\n';
const A2 = '/* ══ IKON MARKETPLACE (didaftarkan) ══ */';
const K2 = '/* ══ AKHIR IKON MARKETPLACE (didaftarkan) ══ */';
const jA = b.indexOf(A2);
if (jA >= 0) {
  const jB = b.indexOf(K2);
  if (jB < 0) throw new Error('penanda akhir daftar tidak ditemukan');
  b = b.slice(0, jA) + b.slice(jB + K2.length);
}
const blokDaftar = [A2, ...daftar, K2].join(EB);
// Sisipkan tepat sebelum penutup array PAKET_EXTRA.
const idxTutup = b.indexOf('\n];', b.indexOf('const PAKET_EXTRA'));
if (idxTutup < 0) throw new Error('penutup PAKET_EXTRA tidak ditemukan');
b = b.slice(0, idxTutup) + EB + blokDaftar + b.slice(idxTutup);
fs.writeFileSync('src-tauri/src/ext_bundled.rs', b, 'utf8');

console.log('paket ikon ditulis:', paket.length);
