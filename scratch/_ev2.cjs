const fs = require("fs");
const s = fs.readFileSync("src/lib/events.ts", "utf8");
console.log(s.slice(0, 1200));
