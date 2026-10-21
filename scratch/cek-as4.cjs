const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts", "utf8");
console.log(t.slice(197015, 197420));
