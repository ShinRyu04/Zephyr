const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");

/*
 * Sisipkan baris "Local <folder>" sebagai ANAK TERAKHIR dari .ai-input-row.
 *
 * Cara yang pasti: cari penanda yang hanya muncul SEKALI dan berada tepat
 * selepas penutup .ai-input-row, lalu sisipkan sebelum penutup itu.
 * Penandanya: blok komentar "NO status strip below the composer".
 */
const penanda = "      {/*\n        * There is NO status strip below the composer any more.";
let idx = t.indexOf(penanda);
if (idx < 0) {
  // file mungkin CRLF
  const penandaCRLF = penanda.replace(/\n/g, "\r\n");
  idx = t.indexOf(penandaCRLF);
  if (idx < 0) { console.log("GAGAL: penanda tidak ditemukan"); process.exit(1); }
}

// Penutup .ai-input-row = "      </div>" terakhir SEBELUM penanda
const sebelum = t.slice(0, idx);
const posTutup = sebelum.lastIndexOf("      </div>");
if (posTutup < 0) { console.log("GAGAL: penutup tidak ditemukan"); process.exit(1); }
console.log("penutup ai-input-row di", posTutup);

const NL = t.includes("\r\n") ? "\r\n" : "\n";
const blok = [
  '        {/*',
  '          * "Local <folder>" - the LAST row INSIDE the box.',
  '          *',
  '          * Measured on 1.1.png: the box ends at y 523 and this row sits at',
  '          * y 511-523, on the bottom edge of the border. It is part of the',
  '          * card, which is why it goes away with the card once a conversation',
  '          * starts - after that the workspace is fixed by the session.',
  '          */}',
  '        {jumlahPesan === 0 && (',
  '          <div className="ai-local-row">',
  '            <span className="ai-local-label">{tr(\'Local\')}</span>',
  '            <button',
  '              type="button"',
  '              className="ai-local-pilih"',
  '              data-testid="ai-local-pilih"',
  '              onClick={() => void pilihFolderKerja()}',
  '              title={workspaceAktif ?? tr(\'Select a folder (optional)\')}',
  '            >',
  '              {workspaceAktif ? namaFolder(workspaceAktif) : tr(\'Select a folder (optional)\')}',
  '            </button>',
  '          </div>',
  '        )}',
  ''
].join(NL);

t = t.slice(0, posTutup) + blok + t.slice(posTutup);
fs.writeFileSync(P, t, "utf8");
console.log("local row disisipkan di dalam kotak");
