const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const i = t.indexOf('<div className="ai-input-row">');
const j = t.indexOf('<div className="ai-send-wrap">', i);
console.log("send-wrap:", j);
console.log(JSON.stringify(t.slice(j + 400, j + 1400)));
