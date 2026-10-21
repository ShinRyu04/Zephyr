const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
for (let i = 0; i < L.length; i++) {
  if (L[i].includes('<div className="ai-send-wrap">')) {
    for (let k = i; k < i + 40; k++) {
      if (L[k].trim() === "</div>" && L[k+1] && L[k+1].trim() === "</div>") {
        console.log("KANDIDAT:", k+1);
        console.log(L.slice(k-2, k+6).map((l,j)=>(k-1+j)+": "+JSON.stringify(l)).join("\n"));
        break;
      }
    }
    break;
  }
}
