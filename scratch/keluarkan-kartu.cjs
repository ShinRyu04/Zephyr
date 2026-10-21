const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = t.includes("\r\n") ? "\r\n" : "\n";

/*
 * Keluarkan .ai-kategori dari DALAM .ai-input-row.
 *
 * Ukurannya membuktikan kesalahan: .ai-input-row setinggi 408px sementara
 * isinya (field 40 + toolbar 52 + local 26) hanya 118. Sisanya 290px adalah
 * kartu yang ikut masuk ke dalam kotak.
 *
 * Caranya: potong blok .ai-kategori, lalu sisipkan SETELAH penutup
 * .ai-input-row.
 */
const mulai = t.indexOf('        <div className="ai-kategori">');
if (mulai < 0) { console.log("GAGAL: ai-kategori tidak ketemu"); process.exit(1); }

// cari penutup .ai-kategori: baris "        </div>" pertama setelahnya
let akhir = -1;
let p = t.indexOf('</div>', t.indexOf("</div>", mulai) + 6);
// lebih aman: cari penanda komentar penutup yang kita tulis (baris "        </div>" tepat)
const blokKomentar = "        </div>" + NL;
const idxSetelah = t.indexOf(blokKomentar, t.indexOf("))}", mulai));
akhir = idxSetelah + blokKomentar.length;
const blok = t.slice(mulai, akhir);
console.log("blok kategori panjang:", blok.length);

// buang dari posisi lama
t = t.slice(0, mulai) + t.slice(akhir);

// sisipkan setelah penutup .ai-input-row
const penanda = "      {/*" + NL + "        * There is NO status strip below the composer any more.";
let idx = t.indexOf(penanda);
if (idx < 0) { console.log("GAGAL: penanda tidak ada"); process.exit(1); }
const sebelum = t.slice(0, idx);
const posTutup = sebelum.lastIndexOf("      </div>");
console.log("penutup ai-input-row:", posTutup);

t = t.slice(0, posTutup + "      </div>".length) + NL + blok + t.slice(posTutup + "      </div>".length);
fs.writeFileSync(P, t, "utf8");
console.log("kategori dikeluarkan dari kotak");
