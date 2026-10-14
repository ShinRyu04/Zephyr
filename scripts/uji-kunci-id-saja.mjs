/*
 * Klasifikasi 73 kunci yang HANYA ada di kamus ID (src/lib/i18n-extra.ts):
 *   - nilai ID-nya (identitas vs teks Indonesia),
 *   - apakah kuncinya benar-benar dipakai di kode sumber (bukan sampah kamus),
 *   - apakah ada kunci "kembar" di AR (beda tanda hubung/kutip saja).
 *
 * Tujuan: memutuskan mana yang perlu diterjemahkan ke AR dan mana yang memang
 * nama bentuk (proper noun) yang nilainya identitas.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const POLA_KUNCI = /^\s{2}('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/gm;

function bacaKamus(berkas) {
  const teks = readFileSync(berkas, 'utf8');
  const batas = [...teks.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
    b: m[1],
    i: m.index,
  }));
  const kamus = {};
  for (let i = 0; i < batas.length; i++) {
    const a = i + 1 < batas.length ? batas[i + 1].i : teks.length;
    const peta = new Map();
    for (const m of teks.slice(batas[i].i, a).matchAll(POLA_KUNCI)) {
      peta.set(m[1].slice(1, -1), m[2].slice(1, -1));
    }
    kamus[batas[i].b] = peta;
  }
  return kamus;
}

const kamus = bacaKamus('src/lib/i18n-extra.ts');
const id = kamus.ID;
const ar = kamus.AR;

// Kumpulkan seluruh kode sumber (tanpa berkas kamus).
function berkasKode(akar) {
  const hasil = [];
  for (const nama of readdirSync(akar)) {
    const p = join(akar, nama);
    const s = statSync(p);
    if (s.isDirectory()) hasil.push(...berkasKode(p));
    else if (/\.(ts|tsx)$/.test(nama) && !/^i18n(-extra|-src)?\.ts$/.test(nama)) hasil.push(p);
  }
  return hasil;
}

const kode = berkasKode('src').map((p) => readFileSync(p, 'utf8')).join('\n');
const normal = (s) => s.replace(/[—–]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
const arNormal = new Set([...ar.keys()].map(normal));

const hanyaID = [...id.keys()].filter((k) => !ar.has(k));
console.log('ID saja (tidak ada di AR): ' + hanyaID.length);
let dipakai = 0;
let identitas = 0;
let kembar = 0;
for (const k of hanyaID) {
  const nilai = id.get(k);
  const adaDiKode = kode.includes(k);
  if (adaDiKode) dipakai++;
  if (nilai === k) identitas++;
  const kembarNormal = arNormal.has(normal(k)) && !ar.has(k);
  if (kembarNormal) kembar++;
  console.log(
    (adaDiKode ? 'PAKAI ' : 'MATI  ') +
      '| ' +
      (nilai === k ? 'identitas' : 'Indonesia') +
      ' | ' +
      (kembarNormal ? 'KEMBAR-normal' : '            ') +
      ' | ' +
      k.slice(0, 95),
  );
}
console.log('\nringkas: dipakai-di-kode=' + dipakai + ' nilai-identitas=' + identitas + ' kembar-setelah-normalisasi=' + kembar);
