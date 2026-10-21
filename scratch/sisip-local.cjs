const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
const L = fs.readFileSync(P, "utf8").split("\n");

let tb = -1;
for (let i = 0; i < L.length; i++) if (L[i].includes('<div className="ai-input-toolbar">')) { tb = i; break; }
let depth = 0, tutup = -1;
for (let i = tb; i < L.length; i++) {
  depth += (L[i].match(/<div\b/g) || []).length - (L[i].match(/<\/div>/g) || []).length;
  if (depth === 0 && i > tb) { tutup = i; break; }
}
console.log("toolbar", tb + 1, "tutup", tutup + 1);

const blok = [
  '',
  '        {/*',
  '          * "Local <folder>" - the LAST row inside the box, not below it.',
  '          *',
  '          * Measured on the reference: the box runs to y 523 and this row',
  '          * occupies y 511-523, i.e. the bottom edge of the border. It is',
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

L.splice(tutup + 1, 0, ...blok);
fs.writeFileSync(P, L.join("\n"), "utf8");
console.log("local row disisipkan");
