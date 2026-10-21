const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
// cari deklarasi composerId di AiPanelInner dan state yang ada
const i = t.indexOf("function AiPanelInner(");
console.log(t.slice(i, i+400));
console.log("--- import commands ---");
console.log(t.slice(t.indexOf("import { clipboardReadImage"), t.indexOf("import { clipboardReadImage")+200));
