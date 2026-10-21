const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
// cari penutup .ai-input-row lagi (setelah perubahan tadi)
for (let i = 1850; i < 2500; i++) {
  if (L[i] && L[i] === "        </div>" && L[i+1] && L[i+1].trim() === "</div>") { console.log("kandidat penutup:", i+1, JSON.stringify(L[i+1])); }
}
