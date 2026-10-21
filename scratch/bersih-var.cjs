const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
const L = fs.readFileSync(P, "utf8").split("\n");
// hapus deklarasi workspaceAktif + openWorkspace + pilihFolderKerja
let awal = -1;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes("The folder a task will happen in, shown under the composer")) { awal = i - 1; break; }
}
if (awal < 0) for (let i = 0; i < L.length; i++) {
  if (L[i].includes("const workspaceAktif = useStore")) { awal = i; break; }
}
let akhir = -1;
for (let i = awal; i < L.length && awal >= 0; i++) {
  if (L[i].includes("if (dipilih) await openWorkspace(dipilih);")) { akhir = i + 1; break; }
}
console.log("awal", awal, "akhir", akhir);
if (awal >= 0 && akhir > awal) L.splice(awal, akhir - awal + 1);
fs.writeFileSync(P, L.join("\n"), "utf8");
