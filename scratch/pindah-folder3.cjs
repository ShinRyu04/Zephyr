const fs = require("fs");
let t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const NL = "\r\n";
// potong blok folder-row dari akhir
const blokMulai = t.indexOf('        {/*' + NL + '          * The folder row directly under the composer');
const blokAkhir = t.indexOf('        )}', blokMulai) + '        )}'.length;
const blok = t.slice(blokMulai, blokAkhir);
t = t.slice(0, blokMulai) + t.slice(blokAkhir);
// hitung penutup ai-input-row DENGAN BENAR mulai dari pembukanya
const awalBaris = t.indexOf('        <div className="ai-input-row">');
let pos = t.indexOf(">", awalBaris) + 1;
let kedalaman = 1;
while (kedalaman > 0) {
  const buka = t.indexOf("<div", pos);
  const tutup = t.indexOf("</div>", pos);
  if (tutup < 0) { console.log("tak seimbang"); break; }
  if (buka >= 0 && buka < tutup) { kedalaman++; pos = t.indexOf(">", buka) + 1; }
  else { kedalaman--; pos = tutup + 6; }
}
console.log("penutup ai-input-row di", pos, "dari", t.length);
t = t.slice(0, pos) + NL + blok + t.slice(pos);
fs.writeFileSync("src/components/ai/AiPanel.tsx", t, "utf8");
console.log("folder-row sekarang di", t.indexOf('<div className="ai-folder-row"'));
