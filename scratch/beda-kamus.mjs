/*
 * Membandingkan kamus i18n-extra.ts: kunci mana yang ada di ID tapi tidak ada
 * di kamus lain, dan mana di antaranya yang teks sumbernya BAHASA INGGRIS
 * (tidak butuh entri di kamus EN, tapi tetap butuh di JA/KO/ZH/ES/FR/DE/PT/AR).
 */
import { readFileSync } from 'node:fs';

const teks = readFileSync('src/lib/i18n-extra.ts', 'utf8');
const batas = [...teks.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  b: m[1],
  i: m.index,
}));
const KUNCI = /^\s{2}('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/gm;

const kamus = {};
for (let i = 0; i < batas.length; i++) {
  const a = i + 1 < batas.length ? batas[i + 1].i : teks.length;
  kamus[batas[i].b] = new Set(
    [...teks.slice(batas[i].i, a).matchAll(KUNCI)].map((m) => m[1].slice(1, -1)),
  );
}

const acuan = kamus.ID;
const bahasa = Object.keys(kamus).filter((b) => b !== 'ID');
for (const b of bahasa) {
  const kurang = [...acuan].filter((k) => !kamus[b].has(k));
  console.log(`\n### ${b}: ${kurang.length} kunci`);
  for (const k of kurang) console.log(`  - ${k}`);
}
