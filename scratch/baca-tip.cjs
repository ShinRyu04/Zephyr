const fs = require("fs");
const t = fs.readFileSync("src/components/ai/ComposerTip.tsx", "utf8");
console.log(t.slice(0, 1200));
