const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
// cari ai-input-row, lalu hitung sampai penutupnya dengan indentasi
let start = -1;
for (let i = 0; i < L.length; i++) if (L[i].includes('<div className="ai-input-row">')) { start = i; break; }
console.log("ai-input-row di baris", start+1);
let depth = 0;
for (let i = start; i < L.length; i++) {
  const buka = (L[i].match(/<div\b/g)||[]).length;
  const tutup = (L[i].match(/<\/div>/g)||[]).length;
  depth += buka - tutup;
  if (i > start && depth === 0) { console.log("penutup di baris", i+1, JSON.stringify(L[i])); break; }
}
