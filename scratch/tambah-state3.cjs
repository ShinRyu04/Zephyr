const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = t.includes("\r\n") ? "\r\n" : "\n";

if (!t.includes("from '../../lib/store'")) {
  t = t.replace(
    "import { clipboardReadImage } from '../../lib/clipboard';",
    "import { clipboardReadImage } from '../../lib/clipboard';" + NL + "import { useStore } from '../../lib/store';"
  );
  console.log("import useStore ditambah");
}

if (!t.includes("function namaFolder(")) {
  const anchor = "function AiPanelInner(";
  const helper = [
    "/** Last path segment of a workspace path, for the folder row. */",
    "function namaFolder(label: string): string {",
    "  const bersih = label.replace(/[\\\\/]+$/, '');",
    "  const bagian = bersih.split(/[\\\\/]/);",
    "  return bagian[bagian.length - 1] || bersih;",
    "}",
    ""
  ].join(NL);
  t = t.replace(anchor, helper + NL + anchor);
  console.log("helper namaFolder ditambah");
}

const anchor2 = "function AiPanelInner({ composerId = '' }: { composerId?: string }) {" + NL + "  const tr = useT();" + NL + "  const tf = useTf();";
const tambah = [
  "function AiPanelInner({ composerId = '' }: { composerId?: string }) {",
  "  const tr = useT();",
  "  const tf = useTf();",
  "  /*",
  "   * The folder a task will run in - shown in the composer's own bottom row.",
  "   *",
  "   * Read as a primitive string so a workspace change re-renders exactly",
  "   * that row, and not the 2500 lines of JSX around it.",
  "   */",
  "  const workspaceAktif = useStore((s) => s.workspace);",
  "  const openWorkspace = useStore((s) => s.openWorkspace);",
  "  /*",
  "   * Pick the working folder for the next task.",
  "   *",
  "   * Distinct from `pilihFolder` below: that one reads a folder's FILE LIST",
  "   * into the draft as context. This one makes the folder the workspace - the",
  "   * same store write the main window's Open Folder makes, so the Files tree,",
  "   * the Changes column and the agent's own cwd all follow it.",
  "   */",
  "  const pilihFolderKerja = async () => {",
  "    const dipilih = await folderDialogOpen();",
  "    if (dipilih) await openWorkspace(dipilih);",
  "  };"
].join(NL);

if (!t.includes("const pilihFolderKerja")) {
  if (!t.includes(anchor2)) { console.log("GAGAL: anchor2 tidak ketemu"); process.exit(1); }
  t = t.replace(anchor2, tambah);
  console.log("state + handler ditambah");
}

fs.writeFileSync(P, t, "utf8");
console.log("selesai");
