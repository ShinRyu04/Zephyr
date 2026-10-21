const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts", "utf8").split("\n");
console.log("=== setRunMode 4035-4060 ===");
console.log(t.slice(4034, 4060).map((l,i)=>(4035+i)+": "+l).join("\n"));
console.log("\n=== pemakaian 5300-5400 ===");
console.log(t.slice(5299, 5400).map((l,i)=>(5300+i)+": "+l).join("\n"));
