/*
 * Resolve the translation ids used by TRAE's chat-history list.
 *
 * The code reads `u(5729,null)` … `u(5735,null)`; the strings behind those ids
 * live in a table in the same bundle. Reading them turns four bare numbers into
 * the actual labels TRAE shows, which is what the Zephyr copy needs.
 */
const fs = require('fs');

const src = fs.readFileSync(
  'D:/Desktop/Trae/resources/app/out/vs/workbench/workbench.desktop.main.solo-lite.js',
  'utf8',
);

const IDS = [5729, 5730, 5731, 5732, 5733, 5734, 5735, 5781, 5782, 5991, 6012];

for (const id of IDS) {
  const pola = [
    new RegExp('(?<![\\d.])' + id + ':\\\\s*"([^"]{1,120})"'),
    new RegExp('(?<![\\d.])' + id + ':\\\\s*`([^`]{1,120})`'),
    new RegExp('\\\\[' + id + '\\\\]\\\\s*=\\\\s*"([^"]{1,120})"'),
  ];
  let hasil = null;
  for (const p of pola) {
    const m = src.match(p);
    if (m) {
      hasil = m[1];
      break;
    }
  }
  console.log(String(id).padEnd(6) + (hasil === null ? '(tidak ketemu)' : hasil));
}
