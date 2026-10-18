const fs = require("fs");
const s = fs.readFileSync("src/lib/i18n.ts", "utf8");
const i = s.indexOf("function translate");
console.log(s.slice(i, i + 800));
