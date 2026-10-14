
import {PETA_FUNGSI} from "./scripts/inventaris-tool.mjs";
for (const n of ["tulis","bacaLengkap","buatDiff","aksiPane","hitungAman","muatLengkap","jalankanSubagent","ingatTulis"]) {
  const f=PETA_FUNGSI.get(n);
  console.log("--",n, f? `${f.berkas}:${f.baris} len=${f.teks.length} cmd=${/cmd\./.test(f.teks)} call=${(f.panggil||[]).slice(0,8).join(",")}` : "MISSING");
  if(f) console.log("   head:", JSON.stringify(f.teks.slice(0,120)));
}
console.log("total fungsi:", PETA_FUNGSI.size);
