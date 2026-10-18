const fs = require('fs');
const p = 'scripts/verify-agc-hooks-browser.mjs';
let s = fs.readFileSync(p, 'utf8');

/* Tambahkan penanda sebelum tiap J( supaya error menunjukkan langkah mana. */
s = s.replace(/^(\s*)(const \w+ = await J\(|await J\()/gm, (m, ind, pre) => {
  return `${ind}console.error('[J] ' + ${JSON.stringify('x')});\n${ind}${pre}`;
});

fs.writeFileSync(p, s);
console.log('trace ditambah');
