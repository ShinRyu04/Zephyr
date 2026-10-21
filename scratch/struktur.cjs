const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const L = t.split("\n");
// cari struktur: ai-chat, ai-empty, ai-input-row
L.forEach((l,i)=>{ if(/className="ai-chat"|className="ai-empty"|className="ai-input-row"|className="ai-saran"|ai-composer-stack|composer-status/.test(l)) console.log((i+1)+": "+l.trim().slice(0,80)); });
