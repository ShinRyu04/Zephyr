// verify-i18n.mjs — pastikan semua bahasa punya SEMUA kunci (anti-campur).
// Dijalankan manual: node scripts/verify-i18n.mjs
// Keluar 0 = lolos; keluar 1 + daftar kunci hilang = gagal.
import { readFileSync } from 'node:fs';

const src = readFileSync('src/lib/i18n.ts', 'utf8');

function keysOf(name) {
  const i = src.indexOf(`const ${name}: Dict`);
  if (i === -1) throw new Error(`dict ${name} tidak ditemukan`);
  const j = src.indexOf('};', i);
  return new Set(
    src
      .slice(i, j)
      .split(/\r?\n/)
      .map((l) => (l.match(/^  '(.+?)':/) || [])[1])
      .filter(Boolean),
  );
}

const ref = keysOf('EN');
let gagal = false;
for (const d of ['ID', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']) {
  const ks = keysOf(d);
  const kurang = [...ref].filter((k) => !ks.has(k));
  const lebih = [...ks].filter((k) => !ref.has(k));
  if (kurang.length === 0 && lebih.length === 0) {
    console.log(`LULUS  ${d} (${ks.size} kunci)`);
  } else {
    gagal = true;
    console.log(`GAGAL  ${d}: kurang [${kurang.join(', ')}] lebih [${lebih.join(', ')}]`);
  }
}
if (gagal) process.exit(1);
console.log('OK — semua bahasa sinkron dengan EN.');
