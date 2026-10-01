// fix-i18n-hooks.mjs — perbaiki hook `t` yang nyasar setelah codemod.
//
// Codemod menaruh `const t = useT()` di fungsi yang isinya memakai t(...),
// tapi ada 3 bentuk yang tidak tertangani:
//   1. komponen nested / arrow tanpa blok  -> hook tidak tersisip
//   2. fungsi non-komponen (helper)         -> hook tidak boleh ada di sana
//   3. useT diimpor tapi tidak dipakai      -> import menganggur
//
// Skrip ini:
//   a. sisipkan `const t = useT()` di fungsi terdekat yang belum punya
//   b. kalau yang memakai t( adalah helper non-komponen, ganti jadi tx(...)
//   c. buang import useT yang tidak terpakai
//
// Jalankan: node scripts/fix-i18n-hooks.mjs [--dry]

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

/** Cari akhir blok `{` mulai dari indeks brace terbuka, lompati string & komentar. */
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i); if (i < 0) break; i++; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Fungsi di file: nama, rentang body, dan apakah komponen (huruf besar). */
function functions(src) {
  const out = [];
  for (const m of src.matchAll(/(?:^|\n)(\s*)(?:export\s+)?(?:default\s+)?function\s+([A-Za-z0-9_$]+)\s*[(<]/g)) {
    const open = src.indexOf('{', m.index + m[0].length);
    if (open < 0) continue;
    const close = matchBrace(src, open);
    if (close < 0) continue;
    out.push({ name: m[2], bodyStart: open + 1, bodyEnd: close });
  }
  for (const m of src.matchAll(/(?:^|\n)(\s*)(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:memo\()?\(?[^;{]*?=>\s*\{/g)) {
    const open = src.lastIndexOf('{', m.index + m[0].length);
    if (open < 0) continue;
    const close = matchBrace(src, open);
    if (close < 0) continue;
    out.push({ name: m[2], bodyStart: open + 1, bodyEnd: close });
  }
  return out.sort((a, b) => a.bodyStart - b.bodyStart);
}

/** Komponen React = nama diawali huruf besar. */
const isKomponen = (n) => /^[A-Z]/.test(n);

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let fixed = 0;

for (const rel of files) {
  const file = join(ROOT, rel);
  let src = readFileSync(file, 'utf8');
  const before = src;
  const hasT = /\bt\('(?:[^'\\]|\\.)*'\)/.test(src);

  if (!hasT) continue;

  // ── a/b. pastikan setiap t( berada di dalam fungsi yang punya hook ──
  const fns = functions(src);
  const used = [];
  for (const m of src.matchAll(/\bt\('(?:[^'\\]|\\.)*'\)/g)) used.push(m.index);

  const inserts = [];
  const jadiTx = [];
  for (const pos of used) {
    // fungsi terdalam yang memuat posisi ini
    const cand = fns.filter((f) => pos > f.bodyStart && pos < f.bodyEnd);
    if (!cand.length) { jadiTx.push(pos); continue; }
    const fn = cand[cand.length - 1]; // terdalam
    if (!isKomponen(fn.name)) { jadiTx.push(pos); continue; }
    const body = src.slice(fn.bodyStart, fn.bodyEnd);
    if (/\bconst\s+t\s*=\s*useT\(\)/.test(body)) continue;
    if (!inserts.includes(fn.bodyStart)) inserts.push(fn.bodyStart);
  }

  for (const at of inserts.sort((x, y) => y - x)) {
    src = src.slice(0, at) + '\n  const t = useT();' + src.slice(at);
    fixed++;
  }

  // helper non-komponen: t( -> tx(
  if (jadiTx.length) {
    src = src.replace(/\bt\('((?:[^'\\]|\\.)*)'\)/g, (full, inner, off) => {
      // hanya yang di luar fungsi komponen
      const inFn = fns.some((f) => off > f.bodyStart && off < f.bodyEnd && isKomponen(f.name));
      return inFn ? full : `tx('${inner}')`;
    });
  }

  // import tx kalau dipakai
  if (/\btx\('/.test(src) && !/\btx\b[^'"]*from\s+['"][^'"]*\/i18n['"]/.test(src)) {
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*\/i18n)['"]/);
    if (m) {
      const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (!names.includes('tx')) names.push('tx');
      src = src.replace(m[0], `import { ${names.join(', ')} } from '${m[2]}'`);
    }
  }

  // ── c. buang useT yang tidak terpakai ──
  if (!/\bt\(/.test(src)) {
    src = src.replace(/import\s*\{\s*useT\s*\}\s*from\s*['"][^'"]*\/i18n['"];\r?\n?/g, '');
    src = src.replace(/,\s*useT\b/g, '').replace(/\buseT\s*,\s*/g, '');
  }

  if (src !== before && !DRY) {
    writeFileSync(file, src, 'utf8');
    console.log(`fix  ${rel}`);
  }
}

console.log(`\nhook disisipkan: ${fixed}`);
