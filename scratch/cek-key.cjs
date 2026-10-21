const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("Add an API key for");
console.log(t.slice(Math.max(0,i-1800), i + 400));
