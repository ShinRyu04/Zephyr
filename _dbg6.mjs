
import {buildInventory} from "./scripts/inventaris-tool.mjs";
import {readFileSync} from "node:fs";
const inv=await buildInventory();
const T=new Map(inv.tools.map(t=>[t.name,t]));
const fam=["edit","multi_edit","replace_in_files","read_file","write_file","mcp__zephyr__read","mcp__zephyr__write","mcp__zephyr__edit","grep","glob","search_codebase","find_files","list_dir","mcp__zephyr__list","mcp__zephyr__grep","mcp__zephyr__glob","todo_write","notes_write","run_command","mcp__zephyr__run_command","terminal_exec"];
for(const n of fam){const t=T.get(n); if(!t) {console.log(n,"(tidak ada)"); continue;} console.log(`${n.padEnd(30)} efek=${String(t.effect).padEnd(10)} aktif=${t.aktifDefault?'Y':'-'} always=${t.dikirimSelalu?'Y':'-'} caps=[${t.capabilities.join(", ")}]`);}
console.log("\n--- semua pasangan dengan caps IDENTIK (non-kosong) ---");
const by=new Map();
for(const t of inv.tools){if(!t.capabilities.length)continue; const k=t.capabilities.join("|"); (by.get(k)??by.set(k,[]).get(k)).push(t.name);}
for(const [k,v] of by) if(v.length>1) console.log("  ",k,"->",v.join(", "));
console.log("\n--- katalog keys ---");
const cat=JSON.parse(readFileSync("scripts/.catkeys.json","utf8").toString());
