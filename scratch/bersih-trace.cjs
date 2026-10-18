const fs = require('fs');
const p = 'scripts/verify-agc-hooks-browser.mjs';
let s = fs.readFileSync(p, 'utf8');
/* Buang baris trace yang ditambahkan skrip debug. */
s = s.split(/\r?\n/).filter((b) => !/console\.error\('\[J\] ' \+/.test(b)).join('\n');
fs.writeFileSync(p, s);
console.log('trace dibersihkan');
