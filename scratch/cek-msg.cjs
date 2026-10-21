const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("export interface Message");
console.log(i > 0 ? t.slice(i, i + 400) : "tidak ada export interface Message");
const j = t.indexOf("messages: ");
console.log("--- messages: ---");
console.log(t.slice(j - 300, j + 300));
