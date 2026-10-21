const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
// cari ai-input-row dan 400 char sesudahnya
const i = t.indexOf('<div className="ai-input-row">');
console.log("ai-input-row:", i);
const j = t.indexOf("</div>", t.indexOf('className="ai-input-toolbar"'));
console.log("setelah toolbar:", j);
console.log(JSON.stringify(t.slice(j, j + 900)));
