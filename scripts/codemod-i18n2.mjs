// codemod-i18n2.mjs — pass kedua: tangani bentuk yang pass pertama lewatkan.
//
// Pass pertama hanya menangani:
//   - atribut JSX satu-baris:  title="Teks"
//   - teks JSX satu-baris:     >Teks<
//
// Pass ini menangani sisanya di file .tsx:
//   - literal di dalam ekspresi JSX: title={kondisi ? 'A' : 'B'}
//   - literal multi-baris / di dalam template
//   - literal di array label di dalam komponen
//
// Aman karena: hanya literal yang ADA di tabel yang diubah, dan pemanggilan
// yang sudah dibungkus tr(/tx( dilewati. Sisa kesalahan (tr di luar komponen)
// ditangkap tsc lalu diperbaiki scripts/fix-i18n-hooks.mjs.
//
// Jalankan: node scripts/codemod-i18n2.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

const KEYS = new Set();
for (const f of ['src/lib/i18n-src.ts', 'src/lib/i18n-extra.ts']) {
  const s = readFileSync(join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/^\s{2}'((?:[^'\\]|\\.)*)':/gm)) KEYS.add(m[1].replace(/\\'/g, "'"));
}

const SKIP = new Set(['node_modules', 'dist', '.vite', 'target']);
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

let files = 0, wrapped = 0;

for (const file of walk(join(ROOT, 'src'))) {
  let src = readFileSync(file, 'utf8');
  const before = src;

  src = src.replace(/'((?:[^'\\]|\\.)*)'/g, (full, text, off) => {
    if (!KEYS.has(text)) return full;
    // WAJIB ada spasi: nilai teknis seperti 'file', 'command', 'id' tidak
    // pernah berupa kalimat, sedangkan seluruh teks UI di tabel ini berupa
    // kalimat. Tanpa syarat ini, `openPalette('file')` ikut jadi tr('file')
    // dan tipe PaletteMode rusak.
    if (!/\s/.test(text)) return full;
    const pre = src.slice(0, off);
    // sudah dibungkus tr( / tx(
    if (/\b(tr|tx)\(\s*$/.test(pre)) return full;
    // baris import / type / className / id teknis
    const lineStart = pre.lastIndexOf('\n') + 1;
    const line = pre.slice(lineStart) + full;
    if (/^\s*(import|export type|type|\/\/|\*|\/\*)/.test(line)) return full;
    if (/className=|data-testid=|data-pane|id=/.test(pre.slice(Math.max(0, pre.length - 120)))) return full;
    wrapped++;
    return `tr('${text}')`;
  });

  if (src !== before) {
    files++;
    if (!DRY) writeFileSync(file, src, 'utf8');
  }
}

console.log(`file: ${files}  literal dibungkus: ${wrapped}${DRY ? '  (dry)' : ''}`);
