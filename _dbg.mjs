
import {buildInventory} from "./scripts/inventaris-tool.mjs";
const inv = await buildInventory();
const T=Object.fromEntries(inv.tools.map(t=>[t.name,t]));
for (const nm of ["glob","lsp_symbols","tool_call"]) {
  const t=T[nm];
  console.log(nm, "adaBatasSistem=", t.adaBatasSistem, "caps=", t.capabilities, "handlers=", t.handlers);
  console.log("   bukti keys:", Object.keys(t.bukti).map(k=>k+"@"+t.bukti[k][0]?.sumber).join(" | "));
}
