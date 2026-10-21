const fs = require("fs");
const t = fs.readFileSync("src/lib/devBridge.ts", "utf8");
const i = t.indexOf("export function installDevBridge");
console.log(t.slice(i, i+800));
