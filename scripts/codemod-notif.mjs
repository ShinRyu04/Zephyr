// codemod-notif.mjs — bungkus pesan notifikasi/toast Indonesia dengan tx().
//
// Berbeda dari codemod komponen: file ini (.ts) tidak punya hook React, jadi
// yang benar adalah `tx()` yang membaca bahasa dari store saat dipanggil —
// bukan saat modul di-import. Pemanggilan notify* terjadi saat aksi user,
// jadi nilainya selalu bahasa terkini.
//
// Jalankan: node scripts/codemod-notif.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

const KEYS = new Set();
for (const f of ['src/lib/i18n-src.ts', 'src/lib/i18n-extra.ts']) {
  const s = readFileSync(join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/^\s{2}'((?:[^'\\]|\\.)*)':/gm)) KEYS.add(m[1].replace(/\\'/g, "'"));
}

// fungsi yang pesannya dilihat user
const FUNGSI = /(notifyInfo|notifyWarn|notifyError|notifySuccess|setToast|setStatusMessage|setMessage)\(\s*$/;

const SKIP = new Set(['node_modules', 'dist', '.vite', 'target']);
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

let files = 0, wrapped = 0;

for (const file of walk(join(ROOT, 'src/lib'))) {
  if (/i18n/.test(file)) continue;
  let src = readFileSync(file, 'utf8');
  const before = src;

  src = src.replace(/'((?:[^'\\]|\\.)*)'/g, (full, text, off) => {
    if (!KEYS.has(text)) return full;
    const pre = src.slice(0, off);
    // tepat setelah notify*( 
    if (!FUNGSI.test(pre)) return full;
    wrapped++;
    return `tx('${text}')`;
  });

  if (src !== before) {
    // pastikan tx diimpor
    if (!/\btx\b/.test(src.match(/import[^;]*i18n[^;]*;?/)?.[0] ?? '')) {
      const m = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*\/i18n)['"]/);
      if (m) {
        const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
        if (!names.includes('tx')) names.push('tx');
        src = src.replace(m[0], `import { ${names.join(', ')} } from '${m[2]}'`);
      } else {
        const rel = relative(dirname(file), join(ROOT, 'src/lib/i18n')).replace(/\\/g, '/');
        const spec = rel.startsWith('.') ? rel : './' + rel;
        const lines = src.split('\n');
        let last = -1;
        lines.forEach((l, i) => { if (/^\s*import\s/.test(l)) last = i; });
        const line = `import { tx } from '${spec}';`;
        if (last >= 0) lines.splice(last + 1, 0, line); else lines.unshift(line);
        src = lines.join('\n');
      }
    }
    files++;
    if (!DRY) writeFileSync(file, src, 'utf8');
  }
}

console.log(`file: ${files}  pesan dibungkus: ${wrapped}${DRY ? '  (dry)' : ''}`);
