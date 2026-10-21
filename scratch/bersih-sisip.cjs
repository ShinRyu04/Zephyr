const fs = require("fs");
let t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const NL = "\r\n";
const blok = [
'',
'        {/*',
'          * The folder row under the composer - the reference places it',
'          * directly beneath the box: "Local" as a static label, then the',
'          * folder picker as the action. It exists because a task almost',
'          * always needs somewhere to happen: without it the only way to',
'          * point the agent at a folder was leaving this window.',
'          */}',
'        <div className="ai-folder-row">',
'          <span className="ai-folder-label">Local</span>',
'          <button',
'            type="button"',
'            className="ai-folder-pilih"',
'            data-testid="ai-folder-pilih"',
'            onClick={() => void pilihFolder()}',
'          >',
'            {workspaceAktif || tr(\'Select a folder (optional)\')}',
'          </button>',
'        </div>'
].join(NL);
// buang sisipan yang salah posisi
t = t.replace(NL + NL + blok.replace(/^/,'').replace(NL + '        </div>' + NL + '  );', NL + '  );'), '');
// buang versi yang nyasar di akhir
const salah = NL + NL + blok;
const posSalah = t.lastIndexOf('        {/*' + NL + '          * The folder row under the composer');
if (posSalah > 0) {
  t = t.slice(0, posSalah).replace(/\s*$/, NL) + t.slice(t.indexOf('  );' + NL + '}', posSalah)).replace(/^  ;/, '  ;');
}
fs.writeFileSync("src/components/ai/AiPanel.tsx", t, "utf8");
console.log("bersih:", !t.includes('ai-folder-row'));
