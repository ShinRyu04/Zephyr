const fs = require("fs");
let t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const NL = "\r\n";
// hapus deklarasi ganda yang saya tambahkan di atas (baris 212-227)
const atas = t.indexOf("  /* The folder a task will happen in, shown under the composer.");
const akhirAtas = t.indexOf("  /*" + NL + "   * The active session is read as a primitive id", atas);
if (atas > 0 && akhirAtas > atas) t = t.slice(0, atas) + t.slice(akhirAtas);
fs.writeFileSync("src/components/ai/AiPanel.tsx", t, "utf8");
console.log("duplikat dihapus:", (t.match(/const pilihFolder/g)||[]).length);
