const fs = require("fs");
const L = fs.readFileSync("src/components/ai/ModelSelector.tsx", "utf8").split("\n");
console.log(L.slice(42, 130).map((l,i)=>(43+i)+": "+l).join("\n"));
