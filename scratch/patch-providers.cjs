const fs = require('fs');
const p = 'src/lib/modelCatalog.tsx';
let s = fs.readFileSync(p, 'utf8');

/* Anchor on the id itself — the comment text around it has been edited twice and
   is not a stable landmark. */
const awal = s.indexOf("      {\n        id: 'xai',");
const akhir = s.indexOf('    ];', awal);
if (awal < 0 || akhir < 0) {
  console.error('anchor tidak ketemu', awal, akhir);
  process.exit(1);
}
console.log('membuang', akhir - awal, 'karakter provider lama');
console.log('kepala:', JSON.stringify(s.slice(awal, awal + 40)));
console.log('ekor:', JSON.stringify(s.slice(akhir - 40, akhir + 6)));

/* Keep the new block in a separate file so this script stays readable. */
const baru = fs.readFileSync('scratch/providers-baru.txt', 'utf8');
s = s.slice(0, awal) + baru + s.slice(akhir);
fs.writeFileSync(p, s);

const m = [...s.matchAll(/id:\s*'([a-z0-9-]+)',\n\s*label:\s*'([^']*)'/g)];
console.log('provider:', m.length);
console.log(m.map((x) => x[1] + '=' + x[2]).join('\n'));
