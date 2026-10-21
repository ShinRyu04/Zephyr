const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const i = t.indexOf('<div className="ai-input-row">');
// cari penutup ai-input-row: baris "      </div>" setelah send-wrap
const j = t.indexOf('<div className="ai-send-wrap">', i);
const k = t.indexOf("\n      </div>", j);
console.log("penutup ai-input-row di", k);
console.log(JSON.stringify(t.slice(k - 200, k + 300)));
