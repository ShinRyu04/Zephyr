const fs = require("fs");
const L = fs.readFileSync("src/lib/devBridge.ts", "utf8").split("\n");
console.log(L.slice(197, 240).map((l,i)=>(198+i)+": "+l).join("\n"));
