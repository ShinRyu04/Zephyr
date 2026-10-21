const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("  newChat: (id");
if (i < 0) { const j = t.indexOf("newChat: (id) =>"); console.log("alt", j); }
const k = t.indexOf("newChat: (id) =>");
console.log("k=", k);
const m = t.indexOf("newChat:", t.indexOf("export const useAi"));
console.log(t.slice(m, m + 1200));
