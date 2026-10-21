const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts", "utf8").split("\n");
console.log("=== bootRunMode 3280-3300 ===");
console.log(t.slice(3279, 3300).map((l,i)=>(3280+i)+": "+l).join("\n"));
