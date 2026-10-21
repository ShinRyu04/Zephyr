const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const i = t.indexOf('className="ai-input"');
console.log(t.slice(i - 800, i + 1000));
