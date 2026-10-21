const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiIkon.tsx", "utf8").split("\n");
console.log(L.slice(315, 335).map((l,i)=>(316+i)+": "+l).join("\n"));
