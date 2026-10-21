const fs = require("fs");
const t = fs.readFileSync("src/lib/models.ts", "utf8");
const i = t.indexOf("export function findModel");
if (i >= 0) console.log(t.slice(i, i+1200)); else console.log("tidak di models.ts");
