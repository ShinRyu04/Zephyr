const fs = require("fs");
const L = fs.readFileSync("src/lib/aiStore.ts", "utf8").split("\n");
console.log(L.slice(4511, 4560).map((l,i)=>(4512+i)+": "+l).join("\n"));
