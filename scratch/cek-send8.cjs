const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("send: async");
const seg = t.slice(i, i + 30000);
const lines = seg.split("\n");
lines.forEach((l, n) => { if (/userMsg|botMsg|ensureSession|pastikanSesi|sesiUntuk|activeIds\[/.test(l)) console.log(n + ": " + l.trim().slice(0,150)); });
