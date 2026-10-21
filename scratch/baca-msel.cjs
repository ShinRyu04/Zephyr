const fs = require("fs");
const t = fs.readFileSync("src/components/ai/ModelSelector.tsx", "utf8");
const i = t.indexOf("ai-model-btn");
console.log(t.slice(i-500, i+900));
