const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("newChat: (");
console.log(t.slice(i, i + 900));
