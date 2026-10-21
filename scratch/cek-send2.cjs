const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("send: async");
const seg = t.slice(i, i + 6000);
const k = seg.indexOf("sid ??");
console.log(seg.slice(Math.max(0,k-800), k + 1500));
