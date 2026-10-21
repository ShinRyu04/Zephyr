const fs = require("fs");
let t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const NL = "\r\n";
// temukan penutup ai-input-row dengan penghitungan keseimbangan
const awalBaris = t.indexOf('        <div className="ai-input-row">');
let kedalaman = 1;
let pos = t.indexOf(">", awalBaris) + 1;
while (kedalaman > 0 && pos < t.length) {
  const buka = t.indexOf("<div", pos);
  const tutup = t.indexOf("</div>", pos);
  if (tutup < 0) break;
  if (buka >= 0 && buka < tutup) { kedalaman++; pos = t.indexOf(">", buka) + 1; }
  else { kedalaman--; pos = tutup + 6; }
}
const sisip = NL + NL +
'        {/*' + NL +
'          * The folder row directly under the composer - the reference\'s' + NL +
'          * "Local | Select a folder (optional)". A task happens SOMEWHERE,' + NL +
'          * and this is the one place to point at it without leaving the' + NL +
'          * panel. Hidden once a conversation is under way: after that the' + NL +
'          * workspace is whatever the transcript says it is.' + NL +
'          */}' + NL +
'        {jumlahPesan === 0 && (' + NL +
'          <div className="ai-folder-row">' + NL +
'            <span className="ai-folder-label">Local</span>' + NL +
'            <button' + NL +
'              type="button"' + NL +
'              className="ai-folder-pilih"' + NL +
'              data-testid="ai-folder-pilih"' + NL +
'              onClick={() => void pilihFolderKerja()}' + NL +
'            >' + NL +
'              {workspaceAktif || tr(\'Select a folder (optional)\')}' + NL +
'            </button>' + NL +
'          </div>' + NL +
'        )}';
t = t.slice(0, pos) + sisip + t.slice(pos);
// tambahkan state + handler: workspaceAktif & pilihFolderKerja
const anchor = "  const tf = useTf();";
const tambah = anchor + NL +
"  /* The folder a task will happen in, shown under the composer. Read as a" + NL +
"     primitive string so a workspace change re-renders exactly this row. */" + NL +
"  const workspaceAktif = useStore((s) => s.workspace);" + NL +
"  const openWorkspace = useStore((s) => s.openWorkspace);" + NL +
"  /*" + NL +
"   * Pick the working folder for the next task." + NL +
"   *" + NL +
"   * Distinct from the existing attach-folder path below: that one reads the" + NL +
"   * folder's files INTO the draft, this one makes it the workspace - the" + NL +
"   * same store write the main window's Open Folder does, so the Files" + NL +
"   * tree, Changes and the agent's own cwd all follow." + NL +
"   */" + NL +
"  const pilihFolderKerja = async () => {" + NL +
"    const dipilih = await folderDialogOpen();" + NL +
"    if (dipilih) await openWorkspace(dipilih);" + NL +
"  };";
t = t.replace(anchor, tambah);
fs.writeFileSync("src/components/ai/AiPanel.tsx", t, "utf8");
console.log("ok");
