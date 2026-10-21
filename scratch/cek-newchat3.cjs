const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const m = t.indexOf("newChat:", t.indexOf("export const useAi"));
console.log(t.slice(m + 1200, m + 2400));
