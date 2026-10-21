const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
console.log(L.slice(20, 32).map((l,i)=>(21+i)+": "+l).join("\n"));
