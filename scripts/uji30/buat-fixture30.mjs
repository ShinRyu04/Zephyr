// buat-fixture30.mjs — fixture untuk verify30 (snippets).
//
// Menyiapkan TIGA hal:
//   1. file kode untuk mengetik prefix (target ekspansi),
//   2. user snippet di %APPDATA%\zephyr\snippets\ (uji V5 jalur user),
//   3. ekstensi palsu dengan contributes.snippets (uji V5 jalur ekstensi).
//
// CATATAN PENTING (pelajaran fase 29): folder fixture TIDAK dihapus dengan
// rmSync — file watcher app memegang handle direktori dan rmdir gagal EBUSY.
// Isi file ditulis ulang saja.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/Zephyr/.zephyr/uji30';
const APPDATA = process.env.APPDATA ?? 'C:/Users/home/AppData/Roaming';
const DIR_SNIP = path.join(APPDATA, 'zephyr', 'snippets');
const DIR_EXT = path.join(APPDATA, 'zephyr', 'extensions', 'uji30-snippets');

const tulis = (p, isi) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, isi, 'utf8');
};

// ── 1. file kode target ──
fs.mkdirSync(ROOT, { recursive: true });

tulis(
  `${ROOT}/target30.ts`,
  [
    '// file uji fase 30 — snippets',
    'export function halo(nama: string) {',
    '  return "halo " + nama;',
    '}',
    '',
    // ── SLOT: baris kerja untuk harness ──
    //
    // Harness mencari baris lewat MARKER ini, bukan nomor baris. Nomor baris
    // hardcoded pecah begitu fixture diedit sedikit (sudah kena: V4 memakai
    // baris 11 padahal const-nya di baris 10 -> seleksi di luar dokumen).
    '// SLOT1',
    '// SLOT2',
    '// SLOT3',
    '// SLOT4',
    'const dibungkus = 1;',
    '',
  ].join('\n'),
);

tulis(
  `${ROOT}/target30.rs`,
  ['// file uji rust fase 30', 'fn main() {', '    ', '}', ''].join('\n'),
);

// ── 2. user snippet ──
//
// Sengaja MENIMPA prefix bawaan ('log') untuk membuktikan prioritas
// user > ekstensi > bawaan, dan menambah prefix baru ('ujiuser').
tulis(
  path.join(DIR_SNIP, 'typescript.json'),
  JSON.stringify(
    {
      'Uji User Snippet': {
        prefix: 'ujiuser',
        body: ['const ${1:nama} = ${2:nilai};', 'console.log(${1:nama});'],
        description: 'snippet user untuk verify30',
      },
      'Timpa Log Bawaan': {
        prefix: 'log',
        body: 'USERLOG(${1:x});',
        description: 'user menimpa snippet bawaan log',
      },
      'Uji Variabel': {
        prefix: 'ujivar',
        body: 'tahun=${CURRENT_YEAR} file=${TM_FILENAME} baris=${TM_LINE_NUMBER}',
        description: 'uji variabel',
      },
      'Uji Seleksi': {
        prefix: 'ujisel',
        body: '[${TM_SELECTED_TEXT}]',
        description: 'uji TM_SELECTED_TEXT',
      },
      'Uji Choice': {
        prefix: 'ujichoice',
        body: 'let x: ${1|string,number,boolean|} = ${2};',
        description: 'uji choice',
      },
      'Uji Nested': {
        prefix: 'ujinest',
        body: 'fn(${1:${2:dalam}});',
        description: 'uji placeholder bersarang',
      },
      'Uji Urutan Nomor': {
        prefix: 'ujiurut',
        // $2 muncul SEBELUM $1 di body: penerjemah harus mengurutkan ulang,
        // karena CM6 memakai urutan kemunculan.
        body: 'a=${2:dua} b=${1:satu} c=$0',
        description: 'uji urutan tab stop',
      },
      'Uji Escape': {
        prefix: 'ujiesc',
        body: 'harga = \\$100; nyata = ${1:x}',
        description: 'uji escape dollar literal',
      },
      'Uji Sinkron Tiga Stop': {
        prefix: 'ujisync',
        // TIGA tab stop ($1, $2, $0) dan $1 muncul DUA KALI.
        //
        // Dua sifat CM6 memaksa bentuk ini:
        //   1. occurrence sinkron bekerja lewat MULTI-SELEKSI (semua instance
        //      field aktif ikut terseleksi), jadi $1 harus muncul dua kali;
        //   2. `moveField` MEMATIKAN mode snippet begitu sampai field TERAKHIR
        //      (`last ? null : ...`), jadi kalau hanya ada $1 dan $2, satu Tab
        //      sudah mengakhiri sesi dan Shift+Tab mengembalikan false.
        //      $0 memberi field ketiga supaya Tab lalu Shift+Tab bisa diuji.
        body: 'let ${1:v} = ${2:isi}; pakai(${1:v}); akhir($0)',
        description: 'uji sinkron occurrence + navigasi tab stop',
      },
    },
    null,
    2,
  ),
);

// ── 3. ekstensi dengan contributes.snippets ──
tulis(
  path.join(DIR_EXT, 'package.json'),
  JSON.stringify(
    {
      name: 'uji30-snippets',
      displayName: 'Uji30 Snippets',
      version: '1.0.0',
      publisher: 'zephyr-uji',
      engines: { zephyr: '^1.0.0' },
      contributes: {
        snippets: [
          { language: 'typescript', path: './snippets/ts.json' },
          { language: 'rust', path: './snippets/rs.json' },
        ],
      },
    },
    null,
    2,
  ),
);

tulis(
  path.join(DIR_EXT, 'snippets', 'ts.json'),
  JSON.stringify(
    {
      'Dari Ekstensi': {
        prefix: 'ujiext',
        body: 'EXT(${1:arg});',
        description: 'snippet dari ekstensi uji30',
      },
      // Prefix yang juga ada di user: user harus menang.
      'Ekstensi Coba Timpa Log': {
        prefix: 'log',
        body: 'EXTLOG(${1});',
        description: 'ekstensi coba menimpa log — harus kalah dari user',
      },
    },
    null,
    2,
  ),
);

tulis(
  path.join(DIR_EXT, 'snippets', 'rs.json'),
  JSON.stringify(
    {
      'Rust Dari Ekstensi': {
        prefix: 'ujiextrs',
        body: 'ext_rust!(${1});',
        description: 'snippet rust dari ekstensi',
      },
    },
    null,
    2,
  ),
);

// `main` wajib ADA meski tidak dieksekusi: `read_package` mencatat error bila
// file entry hilang di jalur `extensions_load`, dan ekstensi ber-error dipaksa
// enabled:false (pelajaran fase 13) — snippet-nya ikut tidak terbaca.
tulis(
  path.join(DIR_EXT, 'index.js'),
  '// Ekstensi uji fase 30. TIDAK dieksekusi (v1 manifest-only).\n',
);

console.log('fixture30 siap:');
console.log('  kode      :', ROOT);
console.log('  user snip :', path.join(DIR_SNIP, 'typescript.json'));
console.log('  ekstensi  :', DIR_EXT);
