const fs = require("fs");
const t = fs.readFileSync("src/lib/store.ts","utf8");
const m = t.match(/^.*(workspace|root|folder).*$/gmi) || [];
console.log(m.slice(0,40).join("\n"));
