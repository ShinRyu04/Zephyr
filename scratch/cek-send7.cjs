const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("send: async");
const seg = t.slice(i, i + 22000);
const k = seg.indexOf("role: 'assistant',");
const nx = seg.indexOf("sessions:", k);
console.log(seg.slice(k + 200, k + 2400));
