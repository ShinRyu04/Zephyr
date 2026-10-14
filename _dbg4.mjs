
import {PETA_FUNGSI} from "./scripts/inventaris-tool.mjs";
const f=PETA_FUNGSI.get("jalankanIngat");
console.log("jalankanIngat:", f? `${f.berkas}:${f.baris} len=${f.teks.length}` : "MISSING");
if(f) console.log("  head:", JSON.stringify(f.teks.slice(0,150)));
console.log("  call:", (f.panggil||[]).join(","));
for (const n of ["bacaTeks","rootAktif","blokMemoriTersimpan","cariMemori","tambahMemori","dokumenTersimpan"]) {
  const g=PETA_FUNGSI.get(n);
  console.log("  helper",n, g? `len=${g.teks.length} cmd=${/cmd\./.test(g.teks)} src=${g.berkas}:${g.baris}` : "MISSING");
}
