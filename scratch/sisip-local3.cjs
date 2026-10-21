const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
const L = t.split("\n");

// 1) buang sisipan nyasar (kalau ada di awal)
let awalBlok = -1, akhirBlok = -1;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes('"Local <folder>" - the LAST row inside the box')) { awalBlok = i - 1; break; }
}
if (awalBlok >= 0) {
  for (let i = awalBlok; i < L.length; i++) if (L[i].trim() === ")}") { akhirBlok = i; break; }
  if (akhirBlok > awalBlok) L.splice(awalBlok, akhirBlok - awalBlok + 1);
}
t = L.join("\n");

/*
 * Penanda struktural yang PASTI: sesudah penutup .ai-input-row datang baris
 * kosong lalu <GoalStrip .../> ? Tidak - GoalStrip ada SEBELUM composer.
 * Yang pasti: penutup .ai-input-row diikuti oleh baris kosong dan lalu
 * blok komentar "There is NO status strip below the composer".
 */
const penanda = "      {/*\n        * There is NO status strip below the composer any more.";
const idx = t.indexOf(penanda);
console.log("penanda ditemukan:", idx);
if (idx < 0) { console.log("GAGAL: penanda tidak ada"); process.exit(1); }

const blok =
`        {/*
          * "Local <folder>" - the LAST row inside the box, not below it.
          *
          * Measured on the reference: the box runs to y 523 and this row
          * sits at y 511-523, i.e. on the bottom edge of the border. It is
          * part of the card, which is why it disappears with the card once a
          * conversation starts - after that the workspace is fixed by the
          * session and asking again would be noise.
          */}
        {jumlahPesan === 0 && (
          <div className="ai-local-row">
            <span className="ai-local-label">{tr('Local')}</span>
            <button
              type="button"
              className="ai-local-pilih"
              data-testid="ai-local-pilih"
              onClick={() => void pilihFolderKerja()}
              title={workspaceAktif ?? tr('Select a folder (optional)')}
            >
              {workspaceAktif ? namaFolder(workspaceAktif) : tr('Select a folder (optional)')}
            </button>
          </div>
        )}
      </div>

`;
// ganti: tutup ai-input-row yang sekarang, jadi blok + penutup
const sebelum = t.slice(0, idx);
const terakhirTutup = sebelum.lastIndexOf("      </div>\n");
console.log("tutup terakhir di", terakhirTutup);
t = sebelum.slice(0, terakhirTutup) + blok + t.slice(idx);
fs.writeFileSync(P, t, "utf8");
console.log("selesai");
