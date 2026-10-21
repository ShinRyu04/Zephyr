const fs = require("fs");
const P = "src/components/agents/AgentsLayout.tsx";
let t = fs.readFileSync(P, "utf8");
t = t.replace("import { fokusEditorWindow } from '../../lib/agentsWindow';",
              "import { fokusEditorWindow } from '../../lib/agentsWindow';\nimport { useAi } from '../../lib/aiStore';");
t = t.replace("  const toggleDetails = () => setKananBuka((v) => !v);",
              "  const toggleDetails = () => setKananBuka(!kananBuka);");
fs.writeFileSync(P, t, "utf8");
console.log("ok");
