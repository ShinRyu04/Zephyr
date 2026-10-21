const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const j = t.indexOf('className="ai-input-toolbar"');
console.log(t.slice(j-1600, j+300));
