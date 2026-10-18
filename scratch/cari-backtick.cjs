const fs = require('fs');
const baris = fs.readFileSync('scripts/verify-fase5-beban.mjs', 'utf8').split(/\r?\n/);
const BT = String.fromCharCode(96);
baris.forEach((b, i) => {
  if (b.includes(BT)) console.log('L' + (i + 1) + ': ' + b.trim().slice(0, 120));
});
