
import {PETA_FUNGSI, buildInventory} from "./scripts/inventaris-tool.mjs";
const f=PETA_FUNGSI.get("lspDocumentSymbolsTool");
console.log("lspDocumentSymbolsTool:", f? `${f.berkas}:${f.baris} len=${f.teks.length}` : "MISSING");
if(f){ console.log(" body head:", JSON.stringify(f.teks.slice(0,120))); console.log(" has useLsp:", /useLsp/.test(f.teks), "has getState:", /getState\(\)/.test(f.teks)); }
const g=PETA_FUNGSI.get("lspHoverTool"); console.log("lspHoverTool:", g? `${g.berkas}:${g.baris} useLsp=${/useLsp/.test(g.teks)}`:"MISSING");
console.log("--- namaPanggilan-ish check on lsp block ---");
import fs from "node:fs";
const s=fs.readFileSync("src/lib/zephyrTools/builtins.ts","utf8").split("\n");
for(let i=1487;i<1500;i++) console.log(i+1+"|"+s[i]);
