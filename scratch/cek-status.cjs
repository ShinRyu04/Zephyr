const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const cek = {
  "ai-toggle-sessions-side": t.includes("ai-toggle-sessions-side"),
  "ai-botbar": t.includes("ai-botbar"),
  "ContextMeter": t.includes("ContextMeter"),
  "InteractiveMenu": t.includes("InteractiveMenu"),
  "ai-composer-hint": t.includes("ai-composer-hint"),
  "ai-folder-row": t.includes("ai-folder-row"),
  "ai-local-row": t.includes("ai-local-row"),
};
console.log(JSON.stringify(cek, null, 1));
