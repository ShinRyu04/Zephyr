const fs = require("fs");
let t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const NL = "\r\n";
const blokMulai = t.indexOf('        {/*' + NL + '          * The folder row directly under the composer');
const blokAkhir = t.indexOf('        )}', blokMulai) + '        )}'.length;
const blok = t.slice(blokMulai, blokAkhir);
// buang dari posisi salah
t = t.slice(0, blokMulai).replace(/\s*$/, NL) + t.slice(blokAkhir);
// sisipkan setelah penutup ai-input-row yang benar (cari dari awal)
const awalBaris = t.indexOf('        <div className="ai-input-row">');
let kedalaman = 1;
let pos = t.indexOf(">", awalBaris) + 1;
while (kedalaman > 0 && pos < blokMulai) {
  const buka = t.indexOf("<div", pos);
  const tutup = t.indexOf("</div>", pos);
  if (tutup < 0) break;
  if (buka >= 0 && buka < tutup) { kedalaman++; pos = t.indexOf(">", buka) + 1; }
  else { kedalaman--; pos = tutup + 6; }
}
// sisip harus jadi ANAK dari wrapper luar, sejajar dengan ai-input-row
// tapi wrapper di sini adalah div luar panel — jadi sejajar dengan ai-input-row saja
t = t.slice(0, pos) + NL + blok + t.slice(pos);
fs.writeFileSync("src/components/ai/AiPanel.tsx", t, "utf8");
console.log("dipindah, posisi", pos);
