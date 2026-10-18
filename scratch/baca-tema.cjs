// Baca 25 tema dari CSS hasil generator, keluarkan daftar {id,label,kind}.
const fs = require('fs');
const css = fs.readFileSync('src/styles/themes-marketplace.css', 'utf8');

const hasil = [];
const re = /\/\* (.+?) — (.+?) \*\/\s*\n\[data-theme='([a-z0-9-]+)'\] \{([\s\S]*?)\n\}/g;
let m;
while ((m = re.exec(css))) {
  const [, label, hint, id, isi] = m;
  const bg = (isi.match(/--bg: (#[0-9a-f]{6})/i) ?? [])[1] ?? '#000000';
  // Terang bila latarnya terang: rata-rata kanal > 0x80.
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const kind = (r + g + b) / 3 > 0x80 ? 'light' : 'dark';
  hasil.push({ id, label, kind, hint });
}
fs.writeFileSync('scratch/tema-baru.json', JSON.stringify(hasil, null, 2), 'utf8');
console.log('terbaca:', hasil.length);
