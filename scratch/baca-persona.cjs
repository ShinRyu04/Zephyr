const fs = require("fs");
const t = fs.readFileSync("src/lib/personaStore.ts", "utf8").split("\n");
console.log(t.slice(54, 140).map((l,i)=>(55+i)+": "+l).join("\n"));
