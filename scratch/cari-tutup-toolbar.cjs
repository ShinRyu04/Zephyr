const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx","utf8").split("\n");
// cari penutup ai-input-row: dari 2087 hitung kedalaman
let depth=0, mulai=-1;
for(let i=2086;i<L.length;i++){
  const l=L[i];
  if(l.includes('className="ai-input-toolbar"')) { mulai=i; }
  if(mulai>0){
    depth += (l.match(/<div/g)||[]).length;
    depth -= (l.match(/<\/div>/g)||[]).length;
    if(depth===0){ console.log("toolbar tutup di", i+1); console.log(L.slice(i-1,i+8).map((x,j)=>(i+j)+": "+x).join("\n")); break; }
  }
}
