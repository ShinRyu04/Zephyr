const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
let start = -1;
for (let i = 0; i < L.length; i++) if (L[i].includes('<div className="ai-input-row">')) { start = i; break; }
let depth = 0;
for (let i = start; i < L.length; i++) {
  const buka = (L[i].match(/<div\b/g)||[]).length;
  const tutup = (L[i].match(/<\/div>/g)||[]).length;
  depth += buka - tutup;
  if (depth === 0 && i > start) { console.log("PENUTUP baris", i+1, JSON.stringify(L[i])); break; }
  if (i > start + 700) { console.log("tidak ketemu, depth=", depth); break; }
}
