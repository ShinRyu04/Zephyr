const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let L = fs.readFileSync(P, "utf8").split("\n");

// 1) buang sisipan yang nyasar di awal file
let awalBlok = -1, akhirBlok = -1;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes('"Local <folder>" - the LAST row inside the box')) { awalBlok = i - 1; break; }
}
if (awalBlok >= 0) {
  for (let i = awalBlok; i < L.length; i++) {
    if (L[i].trim() === ")}" ) { akhirBlok = i; break; }
  }
}
console.log("buang blok nyasar:", awalBlok, akhirBlok);
if (awalBlok >= 0 && akhirBlok > awalBlok) L.splice(awalBlok, akhirBlok - awalBlok + 1);

// 2) cari penutup ai-input-row: dari pembuka, hitung <div> vs </div>
let start = -1;
for (let i = 0; i < L.length; i++) if (L[i].includes('<div className="ai-input-row">')) { start = i; break; }
let depth = 0, tutup = -1;
for (let i = start; i < L.length; i++) {
  depth += (L[i].match(/<div\b/g) || []).length - (L[i].match(/<\/div>/g) || []).length;
  if (depth === 0 && i > start) { tutup = i; break; }
}
console.log("ai-input-row", start + 1, "penutup", tutup + 1, JSON.stringify(L[tutup]));

const blok = [
  '        {/*',
  '          * "Local <folder>" - the LAST row inside the box, not below it.',
  '          *',
  '          * Measured on the reference: the box runs to y 523 and this row',
  '          * sits at y 511-523, i.e. on the bottom edge of the border. It is',
  '          * part of the card, which is why it disappears with the card once a',
  '          * conversation starts - after that the workspace is fixed by the',
  '          * session and asking again would be noise.',
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
];

L.splice(tutup, 0, ...blok);
fs.writeFileSync(P, L.join("\n"), "utf8");
console.log("disisipkan di dalam ai-input-row");
