const fs = require('fs');
const BT = String.fromCharCode(96);
const s = fs.readFileSync('scripts/verify-agc-hooks-browser.mjs', 'utf8');
const lines = s.split(/\r?\n/);
let dalam = false;
lines.forEach((b, i) => {
  let n = 0;
  for (const ch of b) if (ch === BT) n++;
  if (n % 2 === 1) {
    console.log('L' + (i + 1) + (dalam ? ' TUTUP' : ' BUKA') + ': ' + b.trim().slice(0, 90));
    dalam = !dalam;
  }
});
console.log('--- akhir: dalam=' + dalam);
