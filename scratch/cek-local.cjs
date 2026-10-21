const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx","utf8").split("\n");
let n = -1;
L.forEach((l,i)=>{ if(l.includes('ai-local-row')) n=i; });
console.log(L.slice(n-14, n+26).map((l,i)=>(n-13+i)+": "+l).join("\n"));
