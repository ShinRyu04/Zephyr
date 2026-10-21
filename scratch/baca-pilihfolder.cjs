const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx","utf8");
const i = t.indexOf("const pilihFolder");
console.log(t.slice(i-900, i+400));
