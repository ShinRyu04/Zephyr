/* Perbarui label di harness wiki-live: Repo Wiki -> Atlas, tab -> Map/Cards. */
const fs = require('fs');
const p = 'scripts/verify-wiki-live.mjs';
let s = fs.readFileSync(p, 'utf8');

const ganti = [
  ['// Probe live: seksi lipat di Explorer + pane Repo Wiki.', '// Probe live: seksi lipat di Explorer + pane Atlas.'],
  ['/* Pane Repo Wiki. */', '/* Pane Atlas. */'],
  ["console.log('\\nPane Repo Wiki:');", "console.log('\\nPane Atlas:');"],
  ["cek('tab Repo Wiki ada'", "cek('tab Map ada'"],
  ["cek('tab Knowledge Card ada'", "cek('tab Cards ada'"],
];

let ubah = 0;
for (const [dari, ke] of ganti) {
  if (s.includes(dari)) {
    s = s.split(dari).join(ke);
    ubah++;
  } else {
    console.log('  tidak ketemu:', dari.slice(0, 50));
  }
}

fs.writeFileSync(p, s, 'utf8');
console.log(`label diperbarui: ${ubah}/${ganti.length}`);
