const fs = require("fs");
let t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const NL = "\r\n";
// ganti pilihFolder dengan implementasi nyata: dialog folder + openWorkspace
t = t.replace('  const syncWorkspaceLokal = useStore((s) => s.syncWorkspaceLokal);',
'  const openWorkspace = useStore((s) => s.openWorkspace);' + NL +
'  /*' + NL +
'   * Pick a folder for the next task.' + NL +
'   *' + NL +
'   * Opens the real folder dialog and opens the result as the workspace -' + NL +
'   * the same store write the main window\'s "Open Folder" makes, so the' + NL +
'   * whole app (Files tree, Changes, the agent\'s own cwd) follows. No' + NL +
'   * second workspace state, no dead chip.' + NL +
'   */' + NL +
'  const pilihFolder = async () => {' + NL +
'    const dipilih = await folderDialogOpen();' + NL +
'    if (dipilih) await openWorkspace(dipilih);' + NL +
'  };');
fs.writeFileSync("src/components/ai/AiPanel.tsx", t, "utf8");
console.log("pilihFolder ok:", t.includes("const pilihFolder"));
