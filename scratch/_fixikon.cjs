// Ganti nilai settings.icons yang encodingnya rusak jadi UTF-8 yang benar.
const fs = require('fs');
const isi = fs.readFileSync('src/lib/i18n.ts', 'utf8');
const E = isi.includes('\r\n') ? '\r\n' : '\n';
const NILAI = [
  'Ikon',
  'Icons',
  '\u30a2\u30a4\u30b3\u30f3', // アイコン
  '\uc544\uc774\ucf58', // 아이콘
  '\u56fe\u6807', // 图标
  'Iconos',
  'Ic\u00f4nes', // Icônes
  'Symbole',
  '\u00cdcones', // Ícones
  '\u0627\u0644\u0623\u064a\u0642\u0648\u0646\u0627\u062a', // الأيقونات
];
const baris = isi.split(/\r?\n/);
const out = [];
let idx = 0;
for (const b of baris) {
  if (/^\s*'settings\.icons':/.test(b)) {
    const inden = b.match(/^\s*/)[0];
    out.push(inden + "'settings.icons': '" + NILAI[idx] + "',");
    idx++;
    continue;
  }
  out.push(b);
}
fs.writeFileSync('src/lib/i18n.ts', out.join(E), 'utf8');
console.log('diperbaiki:', idx);
