const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
// anak langsung .ai-panel
const i = t.indexOf('data-testid="ai-panel"');
const blok = t.slice(i, i + 6000);
const kelas = [...blok.matchAll(/className="(ai-[a-z-]+)"/g)].map(m => m[1]);
console.log("kelas berurutan di awal panel:", [...new Set(kelas)].slice(0, 14).join(", "));
