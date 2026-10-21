const fs = require('fs');
const s = fs.readFileSync('src/lib/zephyrFakta.ts', 'utf8');
const i = s.indexOf('export const FAKTA_ZEPHYR = `');
const mulai = s.indexOf('`', i);
let j = mulai + 1;
let teks = '';
const esc = { n: '\n', '`': '`', '\\': '\\', $: '' };
while (j < s.length) {
  const c = s[j];
  if (c === '\\') {
    const next = s[j + 1];
    if (next === '`') { teks += '`'; j += 2; continue; }
    if (next === '\\') { teks += '\\'; j += 2; continue; }
    if (next === '$') { teks += '$'; j += 2; continue; }
    teks += c; j += 1; continue;
  }
  if (c === '`') break;
  teks += c;
  j += 1;
}
console.log('char', teks.length, 'token', Math.ceil(teks.length / 4));
console.log('AMBANG 3400 ->', teks.length <= 3400 * 4 ? 'MASIH MUAT' : 'LEWAT ' + (teks.length - 13600));
