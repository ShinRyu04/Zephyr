const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx","utf8");
console.log("=== import useStore ===");
console.log((t.match(/^import .*store.*$/gm)||[]).join("\n"));
console.log("=== workspace pemakaian di AiPanel ===");
console.log((t.match(/^.*\bworkspace\b.*$/gm)||[]).slice(0,10).join("\n"));
