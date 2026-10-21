const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts", "utf8").split("\n");
console.log(t.slice(8110, 8185).map((l,i)=>(8111+i)+": "+l).join("\n"));
