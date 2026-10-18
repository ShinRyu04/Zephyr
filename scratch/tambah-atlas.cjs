/*
 * Tambah kunci 'Atlas' ke sepuluh kamus.
 *
 * Nama produk tidak diterjemahkan, jadi nilainya 'Atlas' di semua bahasa -
 * sama seperti 'Zephyr'. Ditaruh tepat setelah 'Generating…' di tiap kamus
 * supaya letaknya konsisten dan mudah dicari.
 */
const fs = require('fs');
const path = 'src/lib/i18n.ts';

const baris = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const eol = fs.readFileSync(path, 'utf8').includes('\r\n') ? '\r\n' : '\n';

/* Sudah ada? Jangan dobel. */
const sudah = (baris.filter((b) => /^\s*'Atlas':/.test(b)) ?? []).length;
if (sudah >= 10) {
  console.log(`'Atlas' sudah ada di ${sudah} kamus - tidak ada yang ditulis.`);
  process.exit(0);
}

let kamus = null;
const idx = [];
baris.forEach((b, i) => {
  const m = /^const (ID|EN|JA|KO|ZH|ES|FR|DE|PT|AR): Dict = \{/.exec(b);
  if (m) kamus = m[1];
  if (kamus && /^\s*'Generating…':/.test(b)) idx.push({ i, lang: kamus });
});

for (const { i } of idx.reverse()) {
  baris.splice(i + 1, 0, "  'Atlas': 'Atlas',");
}

fs.writeFileSync(path, baris.join(eol), 'utf8');
console.log(`'Atlas' ditambahkan ke ${idx.length} kamus.`);
process.exit(idx.length === 10 ? 0 : 1);
