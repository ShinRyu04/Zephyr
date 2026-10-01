// fix-i18n-final.mjs — pastikan SETIAP pemanggilan terjemah punya sumbernya.
//
// Aturan yang dipakai (deterministik, tidak menebak):
//   * Pemanggilan di dalam KOMPONEN (nama fungsi diawali huruf besar)
//     -> pakai hook: pastikan `const tr = useT()` ada di body komponen itu.
//   * Pemanggilan di LUAR komponen (handler, useEffect, helper, store)
//     -> pakai `tx(...)` yang membaca bahasa dari store langsung. Hook tidak
//        boleh dipanggil di sana (aturan hooks React).
//
// Skrip ini menyelesaikan sisa error setelah codemod: `Cannot find name 't'`,
// `'useT' is declared but its value is never read`, dan pemanggilan tr di luar
// komponen. Aman dijalankan berulang (idempoten).
//
// Jalankan: node scripts/fix-i18n-final.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

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

const isKomponen = (n) => /^[A-Z]/.test(n);
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

let nTr = 0, nTx = 0, nHook = 0, nImport = 0;

for (const file of walk(join(ROOT, 'src'))) {
  let src = readFileSync(file, 'utf8');
  const before = src;
  const isI18n = /lib[\\/]i18n/.test(file);
  if (isI18n) continue;

  // ── 1. hitung ulang: setiap t( / tr( dengan literal, tentukan rumahnya ──
  const fns = functions(src);
  const calls = [];
  for (const m of src.matchAll(/(?<![.\w])(t|tr)\((['"])((?:[^'"\\]|\\.)*?)\2\)/g)) {
    calls.push({ start: m.index, len: m[0].length, fn: m[1], q: m[2], text: m[3] });
  }
  if (!calls.length) continue;

  // ganti dari belakang supaya offset tidak bergeser
  for (const c of [...calls].reverse()) {
    const cand = fns.filter((f) => c.start > f.bodyStart && c.start < f.bodyEnd);
    const fn = cand.length ? cand[cand.length - 1] : null;
    const diKomponen = fn && isKomponen(fn.name);
    const teks = `tr(${c.q}${c.text}${c.q})`;
    if (diKomponen) {
      src = src.slice(0, c.start) + teks + src.slice(c.start + c.len);
      if (c.fn !== 'tr') nTr++;
    } else {
      src = src.slice(0, c.start) + `tx(${c.q}${c.text}${c.q})` + src.slice(c.start + c.len);
      if (c.fn !== 'tx') nTx++;
    }
  }

  // ── 2. hook di komponen yang memakai tr( ──
  const fns2 = functions(src);
  const trPos = [];
  for (const m of src.matchAll(/(?<![.\w])tr\((['"])(?:[^'"\\]|\\.)*\1\)/g)) trPos.push(m.index);
  const perluHook = new Set();
  for (const pos of trPos) {
    const cand = fns2.filter((f) => pos > f.bodyStart && pos < f.bodyEnd);
    const fn = cand.length ? cand[cand.length - 1] : null;
    if (fn && isKomponen(fn.name)) perluHook.add(fn.bodyStart);
  }
  for (const at of [...perluHook].sort((a, b) => b - a)) {
    const body = src.slice(at, at + 400);
    if (/const\s+tr\s*=\s*useT\(\)/.test(src.slice(at, src.indexOf('\n', at + 1) + 1) + body)) continue;
    src = src.slice(0, at) + '\n  const tr = useT();' + src.slice(at);
    nHook++;
  }

  // ── 3. rapikan import ──
  const butuhUseT = /const\s+tr\s*=\s*useT\(\)/.test(src);
  const butuhTx = /(?<![.\w])tx\(/.test(src);
  const imp = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*\/i18n)['"]/);
  if (imp) {
    const names = imp[1].split(',').map((s) => s.trim()).filter(Boolean);
    const bersih = names.filter((n) => (n === 'useT' ? butuhUseT : n === 'tx' ? butuhTx : true));
    if (butuhUseT && !bersih.includes('useT')) bersih.push('useT');
    if (butuhTx && !bersih.includes('tx')) bersih.push('tx');
    const baru = `import { ${bersih.join(', ')} } from '${imp[2]}'`;
    if (baru !== imp[0]) { src = src.replace(imp[0], baru); nImport++; }
  } else if (butuhUseT || butuhTx) {
    const rel = relative(dirname(file), join(ROOT, 'src/lib/i18n')).replace(/\\/g, '/');
    const spec = rel.startsWith('.') ? rel : './' + rel;
    const names = [butuhUseT ? 'useT' : null, butuhTx ? 'tx' : null].filter(Boolean).join(', ');
    const lines = src.split('\n');
    let last = -1;
    lines.forEach((l, i) => { if (/^\s*import\s/.test(l)) last = i; });
    const line = `import { ${names} } from '${spec}';`;
    if (last >= 0) lines.splice(last + 1, 0, line); else lines.unshift(line);
    src = lines.join('\n');
    nImport++;
  }

  if (src !== before && !DRY) writeFileSync(file, src, 'utf8');
}

console.log(`t->tr: ${nTr}  ->tx: ${nTx}  hook: ${nHook}  import: ${nImport}${DRY ? '  (dry)' : ''}`);
