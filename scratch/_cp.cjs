const fs = require("fs");
const s = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split(/\r?\n/);
const out = [];
s.forEach((l, i) => { if (/ChatSettingsPopup|ai-host-pane|export default function|function AiChatOnly|return \(\s*$/.test(l)) out.push((i + 1) + ": " + l.trim().slice(0, 100)); });
fs.writeFileSync("scratch/_cp.txt", out.join("\n"));
console.log(out.length);
