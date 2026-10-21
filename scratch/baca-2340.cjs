const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx","utf8").split("\n");
console.log(L.slice(2319, 2400).map((l,i)=>(2320+i)+": "+l).join("\n"));
