// terjemah-komentar.mjs — rewrite Indonesian code comments to English.
//
// KENAPA per-comment, bukan per-file: a whole-file rewrite would need the
// translator to reproduce every line of code exactly, and one drift breaks the
// build. This walks the actual comment spans, replaces only those, and leaves
// every other byte of the file untouched.
//
// The comment spans come from the TypeScript scanner (TS/TSX) and a small
// Rust-aware scanner, so strings that merely look like comments ("https://...")
// are never touched.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const TULIS = process.argv.includes('--tulis');
const AKAR = process.cwd();

const LEWAT = new Set(['node_modules', 'dist', '.git', 'target', 'release', '.zephyr']);

function kumpulkan(dir, hasil = []) {
  for (const nama of fs.readdirSync(dir)) {
    if (LEWAT.has(nama)) continue;
    const p = path.join(dir, nama);
    const st = fs.statSync(p);
    if (st.isDirectory()) kumpulkan(p, hasil);
    else if (/\.(ts|tsx)$/.test(nama)) hasil.push(p);
  }
  return hasil;
}

/**
 * Every comment span in a TS/TSX file, via the full-file scanner.
 *
 * The scanner is the same one hapus-komentar.mjs uses: it walks the file
 * byte by byte and knows strings from comments, which a regex cannot.
 */
function rentangKomentarTs(isi, jsx) {
  const out = [];
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
      out.push([sc.getTokenPos(), sc.getTextPos()]);
    }
    tok = sc.scan();
  }
  return out;
}

/**
 * Comment spans in Rust source.
 *
 * Rust has no TS scanner, but the rules are simple enough to do by hand: `//`
 * to end of line, `/* ... *\/` nested, and both must be skipped inside string
 * literals, char literals, and raw strings. Raw strings are the trap here:
 * `r#"..."#` may contain `//` that is not a comment.
 */
function rentangKomentarRust(isi) {
  const out = [];
  const n = isi.length;
  let i = 0;
  while (i < n) {
    const c = isi[i];
    const c2 = isi[i + 1];

    if (c === '/' && c2 === '/') {
      const mulai = i;
      while (i < n && isi[i] !== '\n') i++;
      out.push([mulai, i]);
      continue;
    }
    if (c === '/' && c2 === '*') {
      const mulai = i;
      let dalam = 1;
      i += 2;
      while (i < n && dalam > 0) {
        if (isi[i] === '/' && isi[i + 1] === '*') {
          dalam++;
          i += 2;
        } else if (isi[i] === '*' && isi[i + 1] === '/') {
          dalam--;
          i += 2;
        } else i++;
      }
      out.push([mulai, i]);
      continue;
    }
    // Raw string: r"..." or r#"..."# with any number of hashes.
    if (c === 'r' && (c2 === '"' || c2 === '#')) {
      let j = i + 1;
      let pagar = 0;
      while (isi[j] === '#') {
        pagar++;
        j++;
      }
      if (isi[j] === '"') {
        j++;
        const penutup = '"' + '#'.repeat(pagar);
        const k = isi.indexOf(penutup, j);
        i = k === -1 ? n : k + penutup.length;
        continue;
      }
    }
    if (c === '"') {
      i++;
      while (i < n) {
        if (isi[i] === '\\') i += 2;
        else if (isi[i] === '"') {
          i++;
          break;
        } else i++;
      }
      continue;
    }
    if (c === "'") {
      // Char literal or lifetime. Only skip it if it looks like a char literal.
      const m = /^'(\\.|[^\\'])'/.exec(isi.slice(i, i + 8));
      if (m) {
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return out;
}

/**
 * Indonesian function words that never appear in English comments.
 *
 * Chosen because each is common in Indonesian prose and rare or absent in
 * English code comments, so a hit is a reliable signal. `di ` and `ke ` carry
 * the trailing space so they do not match English words like "did" or "keep".
 */
const PENANDA = new RegExp(
  '\\b(dan|yang|dengan|untuk|tidak|adalah|bisa|kalau|harus|dari|jika|sudah|belum|karena|supaya|biar|oleh|pada|ke |di |ini|itu|juga|hanya|saja|masih|banyak|semua|saat|setelah|sebelum|tanpa|melalui|antara|tersebut|dipakai|dibuat|dihapus|ditulis|menggunakan)\\b',
);

const file = kumpulkan(path.join(AKAR, 'src')).concat(
  kumpulkan(path.join(AKAR, 'src-tauri', 'src')),
);

const daftar = [];
for (const f of file) {
  if (!/\.(ts|tsx|rs)$/.test(f)) continue;
  const isi = fs.readFileSync(f, 'utf8');
  const rentang = f.endsWith('.rs') ? rentangKomentarRust(isi) : rentangKomentarTs(isi, f.endsWith('.tsx'));
  for (const [mulai, akhir] of rentang) {
    const teks = isi.slice(mulai, akhir);
    if (PENANDA.test(teks)) {
      daftar.push({
        file: f.replace(AKAR + path.sep, '').replace(/\\/g, '/'),
        mulai,
        akhir,
        teks,
      });
    }
  }
}

console.log(`== ${daftar.length} komentar Indonesia ==`);
if (TULIS) {
  console.log('  (mode tulis belum diimplementasikan di skrip ini)');
}
for (const d of daftar.slice(0, 5)) {
  console.log(`\n  ${d.file}:${d.mulai}`);
  console.log(`    ${d.teks.slice(0, 100).replace(/\n/g, ' ')}`);
}
