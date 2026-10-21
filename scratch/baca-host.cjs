const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiHost.tsx", "utf8");
console.log(t.slice(3000, 5200));
