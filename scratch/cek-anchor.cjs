const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const i = t.indexOf("There is NO status strip below the composer");
console.log("anchor ada:", i > 0);
console.log(JSON.stringify(t.slice(i - 260, i + 80)));
