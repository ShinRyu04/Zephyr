const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
const t = fs.readFileSync(P, "utf8");
const i = t.indexOf('data-testid="ai-toggle-sessions-side"');
console.log(JSON.stringify(t.slice(i-700, i+400)));
