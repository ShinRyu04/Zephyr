const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("send: async");
const seg = t.slice(i, i + 9000);
const k = seg.indexOf("addPromptHistory(diketik)");
console.log(seg.slice(k, k + 2600));
