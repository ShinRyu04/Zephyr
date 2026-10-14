
import fs from "node:fs";
const t = fs.readFileSync("src/lib/zephyrTools/builtins.ts","utf8");
const i = t.indexOf("name: 'glob'");
const iRun = t.indexOf("run:", i);
const iArrow = t.indexOf("=>", iRun);
const iBuka = t.indexOf("{", iArrow);
let dalam=0, akhir=-1;
for(let k=iBuka;k<t.length;k++){const c=t[k];if(c==="{")dalam++;else if(c==="}"){dalam--;if(dalam===0){akhir=k+1;break;}}}
const blok = t.slice(i, akhir);
console.log("block len", blok.length, "has cmd.:", blok.includes("cmd."), "listWorkspaceFiles:", blok.includes("listWorkspaceFiles"));
console.log("BATAS test:", [/\bcmd\.[A-Za-z_]/, /\binvoke\s*\(/, /(?<![.\w])fetch\s*\(/].map(r=>r.test(blok)));
console.log("tail:", JSON.stringify(blok.slice(-160)));
