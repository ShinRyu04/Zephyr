
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const cap = JSON.parse(execFileSync(process.execPath, ['scripts/gen-fakta-zephyr.mjs', '--print-cakupan'], { encoding: 'utf8' }));
const berId = cap.kunci.perintah.filter((t) => /id /.test(t));
console.log('teks perintah ber-id:', berId.length, 'contoh:', JSON.stringify(berId.slice(0, 2)));
const cr = readFileSync('src/lib/commandRegistry.ts', 'utf8').replace(/\r/g, '');
const re = /\{\s*id:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*group:\s*'([^']+)'/g;
const m = [...cr.matchAll(re)];
console.log('registry pola generator:', m.length, m.slice(0, 2).map((x) => x[1]));
if (m[0]) console.log('teks memuat id', m[0][1], ':', cap.kunci.perintah.some((t) => t.includes('id ' + m[0][1])));
const s2 = readFileSync('src/lib/i18n-src.ts', 'utf8').replace(/\r/g, '');
const i = s2.indexOf('export const EN');
console.log('baris EN:', JSON.stringify(s2.slice(i, i + 70)));
console.log('blok src:', (s2.match(/\nexport const [A-Za-z_]+: Record<string, string> = \{\n/g) || []).length);
