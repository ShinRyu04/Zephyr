// hapus-komentar.mjs — buang komentar dari source code Zephyr, sisakan kode.
//
// KENAPA pakai parser, bukan regex: `//` juga muncul di dalam string
// ("https://..."), di template literal, dan di teks JSX. Regex apa pun akan
// memotong baris yang bukan komentar dan merusak kode. TypeScript punya
// scanner yang tahu persis mana komentar dan mana string.
//
// YANG DIPERTAHANKAN (bukan sekadar komentar biasa):
//   - `// eslint-disable-next-line ...` — menghapusnya memunculkan error lint
//     yang sebelumnya sengaja dimatikan (11 tempat di repo ini).
//   - Komentar di dalam JSX yang jadi bagian dari teks? Tidak ada — JSX text
//     bukan komentar, dan scanner tidak menyentuhnya.
//
// Pakai:
//   node scripts/hapus-komentar.mjs            # lihat ringkasan (dry run)
//   node scripts/hapus-komentar.mjs --tulis    # benar-benar menulis

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const TULIS = process.argv.includes('--tulis');
const AKAR = process.cwd();

/** Komentar yang HARUS bertahan: direktif yang mengubah perilaku tooling. */
const SIMPAN = [
  /^\s*eslint-disable/,
  /^\s*@ts-/,
  /^\s*prettier-ignore/,
  /^\s*biome-ignore/,
  // `/// <reference types="..." />` BUKAN komentar biasa: ia memberi tipe
  // global (mis. import.meta.env dari vite/client). Menghapusnya membuat tsc
  // gagal dengan "Property 'env' does not exist on type 'ImportMeta'".
  /^\s*\/\/\/\s*<reference/,
  // `//!` di Rust = doc comment tingkat crate; ikut dipertahankan karena
  // sering memuat atribut fungsional.
  /^\s*\/\/!/,
];

/** Folder yang dilewati. */
const LEWAT = new Set(['node_modules', 'dist', '.git', 'target', 'release', '.zephyr']);

/** Kumpulkan file .ts/.tsx/.rs di bawah satu folder. */
function kumpulkan(dir, hasil = []) {
  for (const nama of fs.readdirSync(dir)) {
    if (LEWAT.has(nama)) continue;
    const p = path.join(dir, nama);
    const st = fs.statSync(p);
    if (st.isDirectory()) kumpulkan(p, hasil);
    else if (/\.(ts|tsx|rs)$/.test(nama)) hasil.push(p);
  }
  return hasil;
}

/**
 * Scan SELURUH isi file dengan scanner TypeScript.
 *
 * KENAPA bukan per-node seperti versi pertama: `ts.forEachChild` tidak
 * menelusuri isi JSX text dan JsxExpression, sehingga `{/* komentar *\/}` di
 * dalam JSX tidak pernah tercatat — 150 komentar lolos dari pembersihan
 * pertama. Scanner penuh melihat setiap token dari byte pertama sampai
 * terakhir, jadi tidak ada komentar yang bisa lolos.
 *
 * LanguageVariant.JSX WAJIB untuk file .tsx: tanpa itu scanner membaca `<div>`
 * sebagai operator pembanding lalu salah menganggap sisanya komentar.
 */
function bersihkanTs(isi, jsx) {
  const buang = [];
  const sc = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    isi,
  );
  let tok = sc.scan();
  while (tok !== ts.SyntaxKind.EndOfFileToken) {
    if (
      tok === ts.SyntaxKind.SingleLineCommentTrivia ||
      tok === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const mulai = sc.getTokenPos();
      const akhir = sc.getTextPos();
      const teksKomentar = isi.slice(mulai, akhir);
      if (!SIMPAN.some((re) => re.test(teksKomentar))) {
        buang.push([mulai, akhir]);
      }
    }
    tok = sc.scan();
  }
  return { buang };
}

/** Buang komentar dari file Rust. Rust memakai sintaks mirip, scanner-nya sama. */
function bersihkanRs(isi) {
  const buang = [];
  const sc = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, isi);
  let tok = sc.scan();
  while (tok !== ts.SyntaxKind.EndOfFileToken) {
    if (
      tok === ts.SyntaxKind.SingleLineCommentTrivia ||
      tok === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const mulai = sc.getTokenPos();
      const akhir = sc.getTextPos();
      const teksKomentar = isi.slice(mulai, akhir);
      // Di Rust, atribut `#[allow(...)]` BUKAN komentar — scanner tidak
      // menyentuhnya. Yang disimpan di sini hanya direktif sejenis.
      if (!SIMPAN.some((re) => re.test(teksKomentar))) {
        buang.push([mulai, akhir]);
      }
    }
    tok = sc.scan();
  }
  return { buang };
}

/**
 * Terapkan daftar rentang buang ke isi file, lalu rapikan baris yang jadi
 * kosong. Baris kosong beruntun >1 diciutkan jadi satu supaya file tidak
 * penuh lubang.
 */
function terapkan(isi, buang) {
  if (buang.length === 0) return { teks: isi, jumlah: 0 };
  buang.sort((a, b) => a[0] - b[0]);
  let hasil = '';
  let pos = 0;
  for (const [mulai, akhir] of buang) {
    if (mulai < pos) continue; // tumpang tindih (sudah dibuang)
    hasil += isi.slice(pos, mulai);
    pos = akhir;
  }
  hasil += isi.slice(pos);

  // Rapikan: buang spasi di ujung baris + ciutkan baris kosong beruntun.
  const baris = hasil.split('\n').map((b) => b.replace(/[ \t]+$/, ''));
  const rapi = [];
  let kosong = 0;
  for (const b of baris) {
    if (b.trim() === '') {
      kosong++;
      if (kosong > 1) continue;
    } else kosong = 0;
    rapi.push(b);
  }
  return { teks: rapi.join('\n'), jumlah: buang.length };
}

const file = kumpulkan(path.join(AKAR, 'src')).concat(kumpulkan(path.join(AKAR, 'src-tauri', 'src')));
let totalFile = 0;
let totalKomentar = 0;
const rincian = [];

for (const f of file) {
  const isi = fs.readFileSync(f, 'utf8');
  const { buang } = f.endsWith('.rs') ? bersihkanRs(isi) : bersihkanTs(isi);
  const { teks, jumlah } = terapkan(isi, buang);
  if (jumlah === 0) continue;
  totalFile++;
  totalKomentar += jumlah;
  rincian.push({ f: f.replace(AKAR + path.sep, '').replace(/\\/g, '/'), n: jumlah });
  if (TULIS) fs.writeFileSync(f, teks);
}

rincian.sort((a, b) => b.n - a.n);
console.log(TULIS ? '== DIHAPUS ==' : '== DRY RUN (belum ada yang berubah) ==');
console.log(`  file    : ${totalFile}`);
console.log(`  komentar: ${totalKomentar}`);
console.log('');
console.log('  10 file dengan komentar terbanyak:');
for (const r of rincian.slice(0, 10)) {
  console.log(`    ${String(r.n).padStart(4)}  ${r.f}`);
}
if (!TULIS) console.log('\n  jalankan dengan --tulis untuk benar-benar menghapus');
