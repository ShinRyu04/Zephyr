const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("send: async");
const seg = t.slice(i, i + 22000);
const k = seg.indexOf("const userMsg: ChatMsg");
console.log(seg.slice(k - 2200, k + 60));
