const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("send: async");
const seg = t.slice(i, i + 30000).split("\n");
console.log(seg.slice(165, 200).join("\n"));
console.log("---- sekitar 440 ----");
console.log(seg.slice(438, 460).join("\n"));
