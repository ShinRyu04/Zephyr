// Lihat struktur entri paket ikon di tabel PAKET, apa adanya.
const fs = require('fs');
const s = fs.readFileSync('src-tauri/src/ext_bundled.rs', 'utf8');

const re = /\(\s*\n?\s*"(zephyr\.ikon-[a-z-]+)",\s*\n?\s*&\[([\s\S]*?)\n\s*\],\s*\n\s*\)/g;
let m;
let n = 0;
const ids = [];
while ((m = re.exec(s))) {
  n++;
  ids.push(m[1]);
  if (n <= 2) {
    console.log('--- ' + m[1] + ' ---');
    console.log(m[2].trim().slice(0, 400));
  }
}
console.log('\ntotal entri paket ikon:', n);
console.log('id:', ids.slice(0, 10).join(', '));

// Bagaimana sebuah konstanta SVG didefinisikan (kalau ada)?
const svgConst = s.match(/pub\(super\) const [A-Z_]*SVG[A-Z_]*:/);
console.log('\nkonstanta SVG di ext_bundled.rs:', svgConst ? svgConst[0] : 'TIDAK ADA');

// Cari blok penanda ikon
for (const tanda of ['IKON MARKETPLACE', 'AKHIR IKON']) {
  const i = s.indexOf(tanda);
  console.log(`penanda "${tanda}":`, i >= 0 ? 'ADA di ' + i : 'tidak ada');
}
