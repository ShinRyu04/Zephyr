const fs = require('fs');
const p = 'scripts/verify-surface-terpisah.mjs';
const baris = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const BT = String.fromCharCode(96);
baris.forEach((b, i) => {
  if (b.includes(BT)) console.log('L' + (i + 1) + ': ' + b.trim().slice(0, 130));
});
