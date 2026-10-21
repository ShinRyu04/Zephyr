const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
t = t.replace(/^import \{ useSessionsSide \} from [^\n]*\n/m, "");
fs.writeFileSync(P, t, "utf8");
console.log("ok:", !t.includes("useSessionsSide }"));
