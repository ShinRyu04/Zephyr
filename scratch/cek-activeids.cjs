const fs = require("fs");
const L = fs.readFileSync("src/lib/aiStore.ts", "utf8").split("\n");
console.log(L.slice(2918, 2950).map((l,i)=>(2919+i)+": "+l).join("\n"));
