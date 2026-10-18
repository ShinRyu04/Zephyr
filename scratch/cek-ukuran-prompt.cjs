const fs = require('fs');
const f = fs.readFileSync('src/lib/zephyrIndeks.ts', 'utf8');
console.log('zephyrIndeks.ts karakter:', f.length);
// hitung entri: pola ["kode","path",...]
const entri = f.match(/^\s*\["/gm) || [];
console.log('perkiraan entri indeks:', entri.length);

const fakta = fs.readFileSync('src/lib/zephyrFakta.ts', 'utf8');
console.log('zephyrFakta.ts karakter:', fakta.length);

// bagian di fakta
const m = fakta.match(/^## .*/gm) || [];
console.log('bagian fakta:', m.length);

// cek apakah semua kunci setelan ada di fakta atau di indeks
const gen = fs.readFileSync('scripts/gen-fakta-zephyr.mjs', 'utf8');
console.log('generator karakter:', gen.length);
