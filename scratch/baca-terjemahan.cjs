/*
 * Resolve the translation ids used by TRAE's chat-history list.
 *
 * The code reads `u(5729,null)` … `u(5735,null)`; the strings behind those ids
 * live in a table in the same bundle. Reading them turns four bare numbers into
 * the actual labels TRAE shows, which is what the Zephyr copy needs.
 */
import fs from 'node:fs';

const src = fs.readFileSync(
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.solo-lite.js',
  'utf8',
);

const IDS = [5729, 5730, 5731, 5732, 5733, 5734, 5735, 5781, 5782, 5991, 6012];

for (const id of IDS) {
  /* The table is a large object literal `{5729:"…",5730:"…"}`. Try the three
     shapes it takes in this bundle before giving up on an id. */
  const pola = [
    new RegExp(`(?<![\\d.])${id}:\\s*"([^"]{1,120})"`),
    new RegExp(`(?<![\\d.])${id}:\\s*\`([^\`]{1,120})\``),
    new RegExp(`\\[${id}\\]\\s*=\\s*"([^"]{1,120})"`),
  ];
  let hasil = null;
  for (const p of pola) {
    const m = src.match(p);
    if (m) {
      hasil = m[1];
      break;
    }
  }
  console.log(String(id).padEnd(6) + (hasil ?? '(tidak ketemu)'));
}
