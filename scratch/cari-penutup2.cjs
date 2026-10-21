const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
// temukan penutup div ai-input-row dengan penghitungan keseimbangan
const awal = t.indexOf('        <div className="ai-input-row">');
let i = t.indexOf(">", awal) + 1;
let kedalaman = 1;
while (kedalaman > 0 && i < t.length) {
  const buka = t.indexOf("<div", i);
  const tutup = t.indexOf("</div>", i);
  if (tutup < 0) break;
  if (buka >= 0 && buka < tutup) { kedalaman++; i = t.indexOf(">", buka) + 1; }
  else { kedalaman--; i = tutup + 6; }
}
console.log("penutup di", i);
console.log(JSON.stringify(t.slice(i, i + 400)));
