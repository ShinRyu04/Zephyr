const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("send: async");
const seg = t.slice(i, i + 14000);
const k = seg.indexOf("agentMode === 'agent'");
const after = seg.slice(k);
const m = after.indexOf("} else");
console.log("=== cabang non-agent ===");
console.log(after.slice(after.length - 3200));
