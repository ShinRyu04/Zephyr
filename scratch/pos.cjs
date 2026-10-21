const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
console.log('input-row di', t.indexOf('<div className="ai-input-row"'));
console.log('toolbar di', t.indexOf('<div className="ai-input-toolbar"'));
console.log('folder-row di', t.indexOf('<div className="ai-folder-row"'));
console.log('panjang', t.length);
