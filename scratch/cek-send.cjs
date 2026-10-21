const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("\n  send: async");
const j = i > 0 ? i : t.indexOf("send: async");
console.log(t.slice(j, j + 1400));
