const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
let a=-1,b=-1;
for (let i=0;i<L.length;i++){
  if (L[i].includes("Bottom status bar, below the composer")) a=i-1;
  if (a>0 && L[i].includes('data-testid="ai-botbar"')) { b=i; break; }
}
console.log("botbar mulai", a+1);
console.log(L.slice(a, a+30).map((l,i)=>(a+1+i)+': '+l).join('\n'));
