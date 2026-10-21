const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiIkon.tsx", "utf8");
const m = t.match(/case '([a-z-]+)'/g) || [];
console.log("ikon tersedia:", [...new Set(m.map(x=>x.replace(/case '|'/g,"")))].join(" "));
