const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
let start = -1;
for (let i = 0; i < L.length; i++) if (L[i].includes('<div className="ai-input-toolbar">')) { start = i; break; }
console.log("toolbar di baris", start+1);
// cari penutup dengan indentasi 8 spasi (sejajar toolbar)
for (let i = start+1; i < L.length; i++) {
  if (L[i] === "        </div>") { console.log("penutup toolbar baris", i+1); break; }
}
// cari textarea
for (let i = 0; i < L.length; i++) if (L[i].includes('className="ai-input"')) { console.log("textarea di baris", i+1); break; }
