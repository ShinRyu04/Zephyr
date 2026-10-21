const fs = require("fs");
const P = "src/components/agents/AgentsSessions.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = t.includes("\r\n") ? "\r\n" : "\n";

// hapus blok CUSTOMS
const a1 = t.indexOf("/** Customizations entries, opened from the footer menu. */");
const a2 = t.indexOf("/** Last path segment of a workspace, for the group header. */");
if (a1 >= 0 && a2 > a1) t = t.slice(0, a1) + t.slice(a2);

// hapus deklarasi yang tidak terpakai
t = t.replace("  const setSettingsOpen = useStore((s) => s.setSettingsOpen);" + NL, "");
t = t.replace("  const bukaCustom = useAgentCustom((s) => s.buka);" + NL, "");
t = t.replace("  const [menuFooter, setMenuFooter] = useState(false);" + NL, "");

// AiIkon hanya dipakai footer
t = t.replace("import AiIkon, { type NamaAiIkon } from '../ai/AiIkon';" + NL, "");

fs.writeFileSync(P, t, "utf8");
console.log("dibersihkan");
