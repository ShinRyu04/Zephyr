// verify-i18n.mjs — pastikan semua bahasa punya SEMUA kunci (anti-campur).
// Dijalankan manual: node scripts/verify-i18n.mjs
// Keluar 0 = lolos; keluar 1 + daftar kunci hilang = gagal.
//
// Memeriksa DUA kamus: i18n.ts (DICTS) dan i18n-extra.ts (EXTRA). EXTRA menang
// atas DICTS di translate(), jadi kunci yang hanya ada di sana (mayoritas fitur
// baru) tidak akan terdeteksi kalau file itu dilewat.
import { readFileSync } from 'node:fs';

const src = readFileSync('src/lib/i18n.ts', 'utf8');
const extra = readFileSync('src/lib/i18n-extra.ts', 'utf8');

function keysOf(name, teks) {
  const i = teks.indexOf(`const ${name}: Dict`);
  if (i === -1) return null; // blok tidak ada di file ini
  const j = teks.indexOf('};', i);
  return new Set(
    teks
      .slice(i, j)
      .split(/\r?\n/)
      .map((l) => (l.match(/^  '(.+?)':/) || [])[1])
      .filter(Boolean),
  );
}

/** Gabungan kunci dari i18n.ts + i18n-extra.ts untuk satu bahasa. */
function semua(name) {
  const a = keysOf(name, src) ?? new Set();
  const b = keysOf(name, extra) ?? new Set();
  return new Set([...a, ...b]);
}

const ref = semua('EN');
let gagal = false;
for (const d of ['ID', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']) {
  const ks = semua(d);
  const kurang = [...ref].filter((k) => !ks.has(k));
  // Kunci ekstra hanya dilaporkan sebagai info: di blok ID, teks sumber = kunci,
  // jadi entri tambahan wajar dan tidak merusak apa pun.
  const lebih = [...ks].filter((k) => !ref.has(k));
  if (kurang.length === 0) {
    console.log(`LULUS  ${d} (${ks.size} kunci${lebih.length ? `, +${lebih.length} ekstra` : ''})`);
  } else {
    gagal = true;
    console.log(`GAGAL  ${d}: kurang [${kurang.join(', ')}]`);
  }
}
if (gagal) process.exit(1);
console.log(`OK — semua bahasa sinkron dengan EN (${ref.size} kunci).`);
