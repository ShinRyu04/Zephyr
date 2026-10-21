const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = t.includes("\r\n") ? "\r\n" : "\n";

/*
 * Struktur sekarang (rusak):
 *
 *   </div>            <- penutup .ai-input-row
 *   </div>            <- penutup .ai-empty (?)  -> menyebabkan dua parent
 *   <div className="ai-kategori">
 *     <div className="ai-saran" role="list">
 *       ...
 *
 * Perbaikan: buang satu "</div>" berlebih sebelum .ai-kategori.
 */
const pola = "        </div>" + NL + "      </div>" + NL + '        <div className="ai-kategori">';
const ganti = "      </div>" + NL + '        <div className="ai-kategori">';

if (!t.includes(pola)) {
  console.log("pola tidak ketemu, cek manual");
  const i = t.indexOf('ai-kategori');
  console.log(JSON.stringify(t.slice(i - 120, i + 40)));
  process.exit(1);
}
t = t.replace(pola, ganti);
fs.writeFileSync(P, t, "utf8");
console.log("penutup berlebih dibuang");
