// rename-hook-i18n.mjs — rename hook terjemah `t` -> `tr`.
//
// Alasan: `t` adalah nama yang sudah dipakai kode ini untuk tab/terminal
// (mis. `tabs.map((t) => ...)`, `p.t`, `TerminalTab t`). Akibatnya di dalam
// loop seperti itu, `t('Teks')` memanggil objek tab, bukan penerjemah —
// tsc melaporkan "This expression is not callable" dan teksnya tidak
// diterjemahkan. `tr` tidak dipakai sebagai variabel di repo ini, jadi aman.
//
// Hanya mengubah pemanggilan dengan literal yang ADA di tabel (i18n-src.ts),
// jadi `t.title`, `t.panes`, dan fungsi lain bernama t tidak tersentuh.
//
// Jalankan: node scripts/rename-hook-i18n.mjs [--dry]

import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

const srcFile = readFileSync(join(ROOT, 'src/lib/i18n-src.ts'), 'utf8');
const KEYS = new Set();
for (const m of srcFile.matchAll(/^\s{2}'((?:[^'\\]|\\.)*)':/gm)) {
  KEYS.add(m[1].replace(/\\'/g, "'"));
}
const EXTRA = readFileSync(join(ROOT, 'src/lib/i18n-extra.ts'), 'utf8');
for (const m of EXTRA.matchAll(/^\s{2}'((?:[^'\\]|\\.)*)':/gm)) KEYS.add(m[1]);

const SKIP = new Set(['node_modules', 'dist', '.vite', 'target']);
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

let files = 0, calls = 0;

for (const file of walk(join(ROOT, 'src'))) {
  let src = readFileSync(file, 'utf8');
  if (!/const\s+tr?\s*=\s*useT\(\)/.test(src)) continue;
  const before = src;

  // 1. deklarasi hook
  src = src.replace(/const\s+t\s*=\s*useT\(\)/g, 'const tr = useT()');

  // 2. pemanggilan dengan literal yang ada di tabel.
  //    (?<![.\w]) supaya objek lain yang punya method t(...) tidak tersentuh.
  src = src.replace(/(?<![.\w])t\((['"])((?:[^'"\\]|\\.)*?)\1\)/g, (full, q, text) => {
    // Terjemahkan hanya literal yang ADA di salah satu tabel; `t.title`,
    // `t.panes`, dan pemanggilan objek lain bernama t tidak tersentuh.
    if (!KEYS.has(text)) return full;
    calls++;
    return `tr(${q}${text}${q})`;
  });

  // 3. pemanggilan yang kuncinya BUKAN teks Indonesia (kunci inti seperti
  //    'nav.scm') tidak ada di tabel, tapi tetap milik hook — kenali dari
  //    bentuknya: kunci bertitik, huruf kecil semua, tanpa spasi.
  src = src.replace(/(?<![.\w])t\((['"])([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)\1\)/g, (full, q, key) => {
    calls++;
    return `tr(${q}${key}${q})`;
  });

  if (src !== before) {
    files++;
    if (!DRY) writeFileSync(file, src, 'utf8');
  }
}

console.log(`file: ${files}  pemanggilan: ${calls}${DRY ? '  (dry)' : ''}`);
