const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
// tampilkan 700 char terakhir sebelum penutup ai-input-row
console.log(JSON.stringify(t.slice(116100, 116910)));
