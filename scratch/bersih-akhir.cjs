const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
const L = fs.readFileSync(P, "utf8").split("\n");
// buang semua baris 2543..2566 (index 2542..2565) = sisipan nyasar di akhir
const sisa = L.slice(2542).filter(x => x.trim() !== "").length;
console.log("baris setelah 2542:", sisa);
L.splice(2542, L.length - 2542);
fs.writeFileSync(P, L.join("\n") + "\n", "utf8");
console.log("dibersihkan");
