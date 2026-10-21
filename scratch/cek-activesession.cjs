const fs = require("fs");
const L = fs.readFileSync("src/lib/aiStore.ts", "utf8").split("\n");
console.log(L.slice(2880, 2910).map((l,i)=>(2881+i)+": "+l).join("\n"));
console.log("=== activeSession ===");
const t = L.join("\n");
const i = t.indexOf("activeSession:");
console.log(t.slice(i, i+420));
