
import { readFileSync } from 'node:fs';
const re = /(?:^|[,{])\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/gm;
for (const f of ['src/lib/i18n-src.ts', 'src/lib/i18n-extra.ts']) {
  const isi = readFileSync(f, 'utf8').replace(/\r/g, '');
  const baris = isi.split('\n');
  let paket = 0, contoh = [];
  baris.forEach((b, i) => {
    const n = [...b.matchAll(re)].length;
    if (n > 1) { paket++; if (contoh.length < 2 && b.length > 0) contoh.push(i + 1); }
  });
  console.log(f, 'baris dengan >1 pasangan:', paket, 'contoh baris:', contoh.join(','));
}
