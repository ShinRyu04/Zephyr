const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const NL = "\r\n";
// sisipkan baris "Local / Select a folder" tepat setelah penutup .ai-input-row
const penutup = t.indexOf('        </div>', t.indexOf('        <div className="ai-input-toolbar">'));
// cari penutup yang sejajar dengan pembuka ai-input-row (8 spasi)
const awalBaris = t.indexOf('        <div className="ai-input-row">');
let idx = awalBaris;
let kedalaman = 1;
let pos = t.indexOf(">", awalBaris) + 1;
while (kedalaman > 0 && pos < t.length) {
  const buka = t.indexOf("<div", pos);
  const tutup = t.indexOf("</div>", pos);
  if (tutup < 0) break;
  if (buka >= 0 && buka < tutup) { kedalaman++; pos = t.indexOf(">", buka) + 1; }
  else { kedalaman--; pos = tutup + 6; }
}
// pos sekarang tepat setelah "</div>" penutup ai-input-row
const sisip = NL + NL + '        {/*' + NL +
'          * The folder row under the composer - the reference places it' + NL +
'          * directly beneath the box: "Local" as a static label, then the' + NL +
'          * folder picker as the action. It exists because a task almost' + NL +
'          * always needs somewhere to happen: without it the only way to' + NL +
'          * point the agent at a folder was leaving this window.' + NL +
'          */}' + NL +
'        <div className="ai-folder-row">' + NL +
'          <span className="ai-folder-label">Local</span>' + NL +
'          <button' + NL +
'            type="button"' + NL +
'            className="ai-folder-pilih"' + NL +
'            data-testid="ai-folder-pilih"' + NL +
'            onClick={() => void pilihFolder()}' + NL +
'          >' + NL +
'            {workspaceAktif || tr(\'Select a folder (optional)\')}' + NL +
'          </button>' + NL +
'        </div>';
t = t.slice(0, pos) + sisip + t.slice(pos);
fs.writeFileSync(P, t, "utf8");
console.log("disisipkan pada", pos);
