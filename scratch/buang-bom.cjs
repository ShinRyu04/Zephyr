const fs = require('node:fs');
const files = process.argv.slice(2);
for (const f of files) {
  let b = fs.readFileSync(f);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    fs.writeFileSync(f, b.subarray(3));
    console.log('BOM dibuang: ' + f);
  } else {
    console.log('tanpa BOM: ' + f);
  }
}
