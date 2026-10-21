const fs = require('fs');
const p = 'src-tauri/src/secrets.rs';
let s = fs.readFileSync(p, 'utf8');

const m = s.match(/const KNOWN_PROVIDERS: \[&str; (\d+)\] = \[([\s\S]*?)\];/);
if (!m) {
  console.error('blok tidak ketemu');
  process.exit(1);
}
const isi = m[2];
const jumlah = (isi.match(/"[^"]+"/g) || []).length;
console.log('deklarasi', m[1], 'sebenarnya', jumlah);

s = s.replace(/const KNOWN_PROVIDERS: \[&str; \d+\]/, `const KNOWN_PROVIDERS: [&str; ${jumlah}]`);
fs.writeFileSync(p, s);
console.log('diperbaiki jadi', jumlah);
