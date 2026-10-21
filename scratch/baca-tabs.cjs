const fs = require("fs");
const L = fs.readFileSync("src/lib/aiTabsStore.ts", "utf8").split("\n");
console.log(L.slice(24, 80).map((l,i)=>(25+i)+": "+l).join("\n"));
