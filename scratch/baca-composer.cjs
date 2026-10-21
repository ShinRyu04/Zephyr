const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx","utf8").split("\n");
let a=-1,b=-1;
for(let i=0;i<L.length;i++){
  if(L[i].includes('className="ai-input-row')) a=i;
  if(a>0 && L[i].includes('ai-send-wrap')) b=i;
  if(a>0 && b>0 && i>b+3) break;
}
console.log("input-row", a+1, "send-wrap", b+1);
console.log(L.slice(a-4, b+22).map((l,i)=>(a-3+i)+": "+l).join("\n"));
