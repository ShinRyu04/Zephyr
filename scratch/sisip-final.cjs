const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
const L = fs.readFileSync(P, "utf8").split("\n");
// buang blok folder-row yang nyasar di akhir
let awal = -1, akhir = -1;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes("The folder row directly under the composer")) { awal = i - 1; }
  if (awal > 0 && L[i].includes("Select a folder (optional)")) { akhir = i + 3; break; }
}
if (awal > 0 && akhir > awal) L.splice(awal, akhir - awal);
// sisipkan setelah baris 2421 (index 2421) = penutup ai-input-row
const sisip = [
'',
'        {/*',
'          * The folder row directly under the composer - the reference\'s',
'          * "Local | Select a folder (optional)". A task happens SOMEWHERE,',
'          * and this is the one place to point at it without leaving the',
'          * panel. Shown only before a conversation starts: afterwards the',
'          * workspace is whatever the transcript is already working in.',
'          */}',
'        {jumlahPesan === 0 && (',
'          <div className="ai-folder-row">',
'            <span className="ai-folder-label">Local</span>',
'            <button',
'              type="button"',
'              className="ai-folder-pilih"',
'              data-testid="ai-folder-pilih"',
'              onClick={() => void pilihFolderKerja()}',
'            >',
'              {workspaceAktif || tr(\'Select a folder (optional)\')}',
'            </button>',
'          </div>',
'        )}'
];
L.splice(2422, 0, ...sisip);
fs.writeFileSync(P, L.join("\n"), "utf8");
console.log("ok");
