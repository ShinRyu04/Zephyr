const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = t.includes("\r\n") ? "\r\n" : "\n";

// 1) HAPUS tagline (diminta user)
const tagAwal = t.indexOf('<p className="ai-empty-tagline">');
if (tagAwal >= 0) {
  const tagAkhir = t.indexOf("</p>", tagAwal) + 4;
  t = t.slice(0, tagAwal) + t.slice(tagAkhir);
  console.log("tagline dihapus");
}

// 2) PINDAHKAN blok kartu (.ai-saran) keluar dari .ai-empty
const saranAwal = t.indexOf('<div className="ai-saran" role="list">');
if (saranAwal < 0) { console.log("GAGAL: ai-saran tidak ketemu"); process.exit(1); }
// cari penutupnya: </div> yang menutup .ai-saran (indentasi 12 spasi)
const saranAkhir = t.indexOf("</div>", t.indexOf("))}", saranAwal)) + 6;
const blokSaran = t.slice(saranAwal, saranAkhir);
console.log("blok saran panjang:", blokSaran.length);

// buang dari posisi lama
t = t.slice(0, saranAwal) + t.slice(saranAkhir);

// 3) SISIPKAN setelah .ai-input-row (setelah baris Local), masih di dalam .ai-empty?
//    Tidak: kartu harus di BAWAH composer, dan composer ada di luar .ai-empty.
//    Jadi sisipkan setelah penutup .ai-input-row.
const penanda = "      {/*" + NL + "        * There is NO status strip below the composer any more.";
let idx = t.indexOf(penanda);
if (idx < 0) { console.log("GAGAL: penanda status strip tidak ada"); process.exit(1); }
const sebelum = t.slice(0, idx);
const posTutup = sebelum.lastIndexOf("      </div>");
console.log("penutup ai-input-row:", posTutup);

// bungkus kartu supaya punya wadah sendiri (di luar kotak, di bawahnya)
const kartuBaru = [
  "",
  "        {/*",
  "          * The category cards, BELOW the composer - measured on 1.1.png:",
  "          * cards at y 576-605, while the composer's second box ends at y 536.",
  "          * They are a separate row under the whole composer, not part of the",
  "          * empty-state block above it.",
  "          */}",
  '        <div className="ai-kategori">',
  blokSaran.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n"),
  "        </div>",
  ""
].join(NL);

t = t.slice(0, posTutup) + kartuBaru + t.slice(posTutup);
fs.writeFileSync(P, t, "utf8");
console.log("kartu dipindah ke bawah composer");
