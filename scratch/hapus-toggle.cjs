const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = "\r\n";
const awal = t.indexOf("        {/*" + NL + "          * Show/hide the agent sessions column, pinned to the RIGHT edge of");
const penanda = "        {!aiMax && (" + NL;
const akhir = t.indexOf("        )}", t.indexOf('data-testid="ai-toggle-sessions-side"')) + "        )}".length;
if (awal < 0 || akhir < awal) { console.log("anchor tidak ketemu", awal, akhir); process.exit(1); }
t = t.slice(0, awal) + t.slice(akhir);
fs.writeFileSync(P, t, "utf8");
console.log("tombol dihapus:", !t.includes("ai-toggle-sessions-side"));
