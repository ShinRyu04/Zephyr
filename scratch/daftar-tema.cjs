// Daftarkan tema marketplace ke THEMES di src/lib/themes.ts (idempoten).
const fs = require('fs');
const baru = JSON.parse(fs.readFileSync('scratch/tema-baru.json', 'utf8'));

let c = fs.readFileSync('src/lib/themes.ts', 'utf8');
const E = c.includes('\r\n') ? '\r\n' : '\n';

// Buang entri lama yang id-nya sama (kalau skrip dijalankan ulang).
for (const t of baru) {
  c = c.replace(new RegExp(`^ *\\{ id: '${t.id}'[^\\n]*\\n`, 'gm'), '');
}

const baris = baru.map(
  (t) => `  { id: '${t.id}', label: '${t.label}', kind: '${t.kind}', hint: '${t.hint}' },`,
);

// Sisipkan sebelum penutup array THEMES.
const penutup = c.indexOf('\n];', c.indexOf('export const THEMES'));
if (penutup < 0) throw new Error('penutup THEMES tidak ditemukan');
const kepala = [
  '',
  '  /*',
  '   * Tema marketplace.',
  '   *',
  '   * Setiap tema di bawah ini mendefinisikan 11 token `--syn-*` sendiri di',
  '   * src/styles/themes-marketplace.css, jadi memilihnya mengubah WARNA KODE,',
  '   * bukan hanya warna sidebar. Itu syarat yang sudah ditetapkan',
  '   * (zeph-tema-warna-sintaks); tema yang hanya menggeser UI akan terlihat',
  '   * identik di editor.',
  '   */',
].join(E);
c = c.slice(0, penutup) + kepala + E + baris.join(E) + c.slice(penutup);

fs.writeFileSync('src/lib/themes.ts', c, 'utf8');
console.log('didaftarkan:', baru.length);
