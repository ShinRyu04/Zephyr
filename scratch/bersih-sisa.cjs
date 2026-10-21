const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
const L = fs.readFileSync(P, "utf8").split("\n");
// buang sisa blok lama mulai baris index 2584 ("* workspace is whatever...") sampai ")}" penutupnya
let awal = -1, akhir = -1;
for (let i = 2580; i < L.length; i++) {
  if (L[i].includes("workspace is whatever the transcript says it is")) { awal = i; break; }
}
if (awal > 0) {
  for (let i = awal; i < L.length; i++) {
    if (L[i].trim() === ")}") { akhir = i; break; }
  }
}
console.log("awal", awal, "akhir", akhir);
if (awal > 0 && akhir > awal) L.splice(awal, akhir - awal + 1);
fs.writeFileSync(P, L.join("\n"), "utf8");
