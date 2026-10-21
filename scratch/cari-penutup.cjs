const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
// cari akhir dari .ai-input-row (penutupnya) dan apa yang datang setelahnya
const awal = t.indexOf('        <div className="ai-input-row">');
const toolbar = t.indexOf('        <div className="ai-input-toolbar">');
// temukan penutup ai-input-row: cari "</div>" setelah blok toolbar dengan indentasi 8 spasi
const kandidat = [];
let idx = toolbar;
for (let k=0; k<60; k++) {
  idx = t.indexOf("</div>", idx+1);
  if (idx < 0) break;
  const sebelum = t.slice(idx-30, idx);
  const sesudah = t.slice(idx, idx+80);
  if (t.slice(idx-8, idx).includes("\n        ")) {
    kandidat.push({posisi: idx, potongan: t.slice(idx, idx+120).replace(/\n/g,"\\n")});
  }
}
console.log("toolbar di", toolbar);
console.log(kandidat.slice(0,6));
