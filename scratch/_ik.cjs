const fs = require("fs");
const isi = fs.readFileSync("src/lib/i18n.ts", "utf8");
const E = isi.includes("\r\n") ? "\r\n" : "\n";
const NILAI = ["Ikon", "Icons", "アイコン", "아이콘", "图标", "Iconos", "Icônes", "Symbole", "Ícones", "الأيقونات"];
const baris = isi.split(/\r?\n/);
const out = [];
let idx = 0;
for (const b of baris) {
  out.push(b);
  if (/^\s*'settings\.theme':/.test(b)) {
    const inden = b.match(/^\s*/)[0];
    const v = NILAI[idx] ?? "Icons";
    out.push(inden + "'settings.icons': '" + v + "',");
    idx++;
  }
}
fs.writeFileSync("src/lib/i18n.ts", out.join(E));
console.log("ditambah:", idx);
