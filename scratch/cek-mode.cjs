const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8");
const i = t.indexOf("import { ModeMenu, PermissionMenu }");
console.log(JSON.stringify(t.slice(i, i + 60)));
const j = t.indexOf("<ModeMenu />");
console.log("ModeMenu dipakai:", j > 0, "posisi:", j);
