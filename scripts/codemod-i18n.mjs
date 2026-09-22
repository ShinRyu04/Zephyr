// codemod-i18n.mjs — bungkus teks Indonesia hardcoded jadi t('teks') / tx('teks').
//
// Kenapa codemod: 220 string di 53 komponen. Dikerjakan tangan = 220 kali
// risiko salah tempel. Codemod + tsc + verifikasi DOM jauh lebih aman.
//
// Yang DIUBAH (hanya bentuk yang tidak ambigu):
//   1. atribut JSX:  title="Teks"        -> title={t('Teks')}
//   2. teks JSX:     >Teks<              -> >{t('Teks')}<
//   3. string biasa: 'Teks' / "Teks"     -> tx('Teks')   (di luar JSX)
//
// Yang TIDAK diubah (butuh tangan, dibiarkan):
//   - template literal berisi ${} (perlu memisah bagian statis)
//   - teks di dalam store/helper tanpa akses hook -> ditandai di laporan
//
// Jalankan: node scripts/codemod-i18n.mjs [--dry]

import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

// Tabel sumber: kunci = teks Indonesia
const srcFile = readFileSync(join(ROOT, 'src/lib/i18n-src.ts'), 'utf8');
const KEYS = new Set();
for (const m of srcFile.matchAll(/^\s{2}'((?:[^'\\]|\\.)*)':/gm)) {
  KEYS.add(m[1].replace(/\\'/g, "'"));
}
console.log(`kunci sumber: ${KEYS.size}`);

const SKIP_DIRS = new Set(['node_modules', 'dist', '.vite', 'target']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Cari akhir blok `{` mulai dari indeks brace terbuka, lompati string & komentar. */
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i); if (i < 0) break; i++; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Semua fungsi/komponen di file: { name, bodyStart, bodyEnd, hookInsert }. */
function functions(src) {
  const out = [];
  // function Nama(...) { ... }
  for (const m of src.matchAll(/(?:^|\n)(\s*)(?:export\s+)?(?:default\s+)?function\s+([A-Za-z0-9_$]+)\s*[(<]/g)) {
    const open = src.indexOf('{', m.index + m[0].length);
    if (open < 0) continue;
    const close = matchBrace(src, open);
    if (close < 0) continue;
    out.push({ name: m[2], bodyStart: open + 1, bodyEnd: close, declStart: m.index });
  }
  // const Nama = (...) => { ... }  /  const Nama = memo(() => { ... })
  for (const m of src.matchAll(/(?:^|\n)(\s*)(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:memo\()?\(?[^;{]*?=>\s*\{/g)) {
    const open = src.lastIndexOf('{', m.index + m[0].length);
    if (open < 0) continue;
    const close = matchBrace(src, open);
    if (close < 0) continue;
    out.push({ name: m[2], bodyStart: open + 1, bodyEnd: close, declStart: m.index });
  }
  return out.sort((a, b) => a.bodyStart - b.bodyStart);
}

const report = { files: 0, attrs: 0, jsx: 0, plain: 0, hooks: 0, skippedTpl: 0, plainNoHook: [] };

for (const file of walk(join(ROOT, 'src'))) {
  if (file.endsWith('i18n-src.ts') || file.endsWith('i18n-extra.ts') || file.endsWith('i18n.ts')) continue;
  // Hanya komponen: .ts (store/helper) ditangani di titik render masing-masing.
  if (!file.endsWith('.tsx')) continue;
  let src = readFileSync(file, 'utf8');
  const before = src;
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const isTsx = file.endsWith('.tsx');
  let nAttr = 0, nJsx = 0, nPlain = 0;

  // ── 1. atribut JSX: name="Teks" ──
  src = src.replace(
    /(\b(?:title|placeholder|aria-label|aria-description|alt)=)(")((?:[^"\\]|\\.)*?)(")/g,
    (full, pre, q1, text, q2) => {
      if (!KEYS.has(text)) return full;
      // Wajib ada spasi: nilai teknis ('file', 'command') bukan kalimat.
      if (!/\s/.test(text)) return full;
      nAttr++;
      return `${pre}{t('${text.replace(/'/g, "\\'")}')}`;
    },
  );

  // ── 2. teks JSX: >Teks< ──
  if (isTsx) {
    src = src.replace(/>([ \t]*)([^<>{}\n]*?)([ \t]*)<\/([A-Za-z0-9_.]+)>/g, (full, s1, text, s2, tag) => {
      const t = text.trim();
      if (!KEYS.has(t)) return full;
      if (!/\s/.test(t)) return full;
      nJsx++;
      return `>${s1}{t('${t.replace(/'/g, "\\'")}')}${s2}</${tag}>`;
    });
  }

  // ── 3. string biasa: SENGAJA dilewati ──
  // Di file .ts (store, helper) tidak ada hook React. Memakai tx() di sana
  // berarti nilainya dievaluasi saat modul di-import — settings.json belum
  // selesai dibaca, jadi labelnya terkunci di bahasa default selamanya.
  // Teks dari store karena itu dibungkus di titik render komponennya.

  if (src === before) continue;

  // ── tambah hook t() ke komponen yang memakainya ──
  if (nAttr + nJsx > 0) {
    const fns = functions(src);
    const inserts = [];
    // semua posisi t( yang kita baru buat
    const used = [];
    for (const m of src.matchAll(/\bt\('(?:[^'\\]|\\.)*'\)/g)) used.push(m.index);
    for (const fn of fns) {
      const inside = used.some((p) => p > fn.bodyStart && p < fn.bodyEnd);
      if (!inside) continue;
      const body = src.slice(fn.bodyStart, fn.bodyEnd);
      if (/\bconst\s+t\s*=\s*useT\(\)/.test(body)) continue;
      inserts.push(fn.bodyStart);
    }
    // sisipkan dari belakang supaya indeks tidak bergeser
    for (const at of inserts.sort((a, b) => b - a)) {
      src = src.slice(0, at) + '\n  const t = useT();' + src.slice(at);
      report.hooks++;
    }
    // import useT
    if (inserts.length || /\bt\(/.test(src)) {
      const hasImport = /from\s+['"][^'"]*\/i18n['"]/.test(src) && /\buseT\b/.test(src.split('\n').filter((l) => l.includes('i18n')).join(' '));
      if (!hasImport) {
        const relPath = relative(dirname(file), join(ROOT, 'src/lib/i18n')).replace(/\\/g, '/');
        const imp = `import { useT } from '${relPath.startsWith('.') ? relPath : './' + relPath}';`;
        const lines = src.split('\n');
        // taruh setelah import terakhir
        let last = -1;
        lines.forEach((l, i) => { if (/^\s*import\s/.test(l)) last = i; });
        if (last >= 0) lines.splice(last + 1, 0, imp);
        else lines.unshift(imp);
        src = lines.join('\n');
      }
    }
  }

  if (!DRY) writeFileSync(file, src, 'utf8');
  report.files++;
  report.attrs += nAttr; report.jsx += nJsx; report.plain += nPlain;
  console.log(`${String(nAttr + nJsx + nPlain).padStart(3)}  ${rel}  (attr ${nAttr}, jsx ${nJsx}, plain ${nPlain})`);
}

console.log('\n== ringkasan ==');
console.log(report);
