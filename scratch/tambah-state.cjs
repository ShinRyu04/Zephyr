const fs = require("fs");
let t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const NL = "\r\n";
// 1. tambah import useStore
if (!t.includes("import { useStore } from '../../lib/store';")) {
  t = t.replace("import { clipboardReadImage } from '../../lib/clipboard';",
                "import { clipboardReadImage } from '../../lib/clipboard';" + NL + "import { useStore } from '../../lib/store';");
}
// 2. tambah state di AiPanelInner setelah const tf = useTf();
t = t.replace("function AiPanelInner({ composerId = '' }: { composerId?: string }) {" + NL + "  const tr = useT();" + NL + "  const tf = useTf();",
  "function AiPanelInner({ composerId = '' }: { composerId?: string }) {" + NL +
"  const tr = useT();" + NL +
"  const tf = useTf();" + NL +
"  /* The folder a task will happen in, shown under the composer. Read as a" + NL +
"     primitive string so a workspace change re-renders exactly this row. */" + NL +
"  const workspaceAktif = useStore((s) => s.workspace);" + NL +
"  const syncWorkspaceLokal = useStore((s) => s.syncWorkspaceLokal);");
fs.writeFileSync("src/components/ai/AiPanel.tsx", t, "utf8");
console.log("state ok:", t.includes("workspaceAktif"));
