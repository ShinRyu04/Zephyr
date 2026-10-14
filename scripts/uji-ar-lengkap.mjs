/*
 * Uji cakupan kamus AR di SELURUH sumber kamus:
 *   - src/lib/i18n.ts          (DICTS: id..ar)
 *   - src/lib/i18n-extra.ts    (EXTRA: id..ar)
 *
 * Untuk tiap berkas: ukuran kunci tiap bahasa, lalu selisih dua arah AR-vs-<b>.
 * Tujuan: memastikan klaim "AR kurang tepat 1 kunci" bisa dibuktikan atau
 * dibantah dengan angka, bukan tebakan.
 */

import { readFileSync } from 'node:fs';

const POLA_BLOK = /^const ([A-Z]{2}): Dict = \{/gm;
const POLA_KUNCI = /^\s{2}('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/gm;

function bacaKamus(berkas) {
  const teks = readFileSync(berkas, 'utf8');
  const batas = [...teks.matchAll(POLA_BLOK)].map((m) => ({ b: m[1], i: m.index }));
  const kamus = {};
  for (let i = 0; i < batas.length; i++) {
    const a = i + 1 < batas.length ? batas[i + 1].i : teks.length;
    kamus[batas[i].b] = new Set(
      [...teks.slice(batas[i].i, a).matchAll(POLA_KUNCI)].map((m) => m[1].slice(1, -1)),
    );
  }
  return kamus;
}

for (const berkas of ['src/lib/i18n.ts', 'src/lib/i18n-extra.ts']) {
  const kamus = bacaKamus(berkas);
  const bhs = Object.keys(kamus);
  console.log('=== ' + berkas + ' ===');
  console.log(bhs.map((b) => b + '=' + kamus[b].size).join(' '));

  const ref = 'AR';
  if (!kamus[ref]) {
    console.log('  (tidak ada kamus AR di berkas ini)\n');
    continue;
  }
  for (const b of bhs) {
    if (b === ref) continue;
    const kurangDiAR = [...kamus[b]].filter((k) => !kamus[ref].has(k));
    const lebihDiAR = [...kamus[ref]].filter((k) => !kamus[b].has(k));
    if (kurangDiAR.length === 0 && lebihDiAR.length === 0) continue;
    console.log('  AR vs ' + b + ': ' + b + ' punya ' + kurangDiAR.length + ' yang AR tidak punya; AR punya ' + lebihDiAR.length + ' yang ' + b + ' tidak punya');
  }
  const terbanyak = bhs.reduce((a, b) => (kamus[a].size >= kamus[b].size ? a : b));
  const kurang = [...kamus[terbanyak]].filter((k) => !kamus[ref].has(k));
  console.log('  acuan terbesar = ' + terbanyak + '; AR kurang ' + kurang.length + ' kunci');
  console.log('');
}
