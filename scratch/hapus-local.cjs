const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
const L = fs.readFileSync(P, "utf8").split("\n");
let awal = -1, akhir = -1;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes("The folder row directly under the composer")) { awal = i - 1; break; }
}
if (awal >= 0) {
  for (let i = awal; i < L.length; i++) {
    if (L[i].trim() === ")}" && L[i].startsWith("        )")) { akhir = i; break; }
  }
}
console.log("awal", awal, "akhir", akhir);
if (awal >= 0 && akhir > awal) L.splice(awal, akhir - awal + 1);
fs.writeFileSync(P, L.join("\n"), "utf8");
console.log("folder row dihapus:", !fs.readFileSync(P, "utf8").includes("ai-folder-row"));
