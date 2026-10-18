const fs = require("fs");
const s = fs.readFileSync("src/lib/store.ts", "utf8").split(/\r?\n/);
console.log(s.slice(1780, 1840).join("\n"));
