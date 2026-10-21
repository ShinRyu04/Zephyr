const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts", "utf8").split("\n");
console.log("=== bootEffort 3305-3325 ===");
console.log(t.slice(3304, 3325).map((l,i)=>(3305+i)+": "+l).join("\n"));
console.log("\n=== setApprovalMode 4057-4080 ===");
console.log(t.slice(4056, 4080).map((l,i)=>(4057+i)+": "+l).join("\n"));
