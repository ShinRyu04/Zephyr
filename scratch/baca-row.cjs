const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const i = t.indexOf('className="ai-input-row"');
console.log(t.slice(i-260, i+120));
