const fs = require("fs");
const L = fs.readFileSync("src/components/ai/ModelSelector.tsx", "utf8").split("\n");
console.log(L.slice(325, 370).map((l,i)=>(326+i)+": "+l).join("\n"));
