const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx","utf8").split("\n");
console.log(L.slice(2267, 2320).map((l,i)=>(2268+i)+": "+l).join("\n"));
