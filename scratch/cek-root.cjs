const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const i = t.indexOf('className={`ai-panel');
const j = t.indexOf("className=\"ai-panel");
console.log("template:", i);
console.log("statis:", j);
if (i >= 0) console.log(JSON.stringify(t.slice(i-100, i+260)));
if (j >= 0) console.log("STATIS>>", JSON.stringify(t.slice(j-100, j+200)));
