const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiIkon.tsx", "utf8").split("\n");
console.log(L.slice(368, 382).map((l,i)=>(369+i)+": "+l).join("\n"));
