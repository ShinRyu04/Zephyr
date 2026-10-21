const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
let a = -1, b = -1;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes('className="ai-empty"')) a = i;
  if (a > 0 && L[i].includes(") : (") ) { b = i; break; }
}
console.log("ai-empty baris", a+1, "sampai", b+1);
console.log(L.slice(a-1, b+2).map((l,i)=>(a+i)+': '+l).join('\n'));
