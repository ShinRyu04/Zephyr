const fs = require('fs');
const p = 'scripts/verify-agc-hooks-browser.mjs';
let s = fs.readFileSync(p, 'utf8');
/* `})())` adalah IIFE yang terpanggil dua kali; yang benar `})()`. */
const salah = '})())`';
const benar = '})()`';
let n = 0;
while (s.includes(salah)) {
  s = s.replace(salah, benar);
  n += 1;
}
fs.writeFileSync(p, s);
console.log('diperbaiki ' + n + ' tempat');
