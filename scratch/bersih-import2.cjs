const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
t = t.replace("import ContextMeter from './ContextMeter';\r\n", "");
t = t.replace("import ContextMeter from './ContextMeter';\n", "");
t = t.replace("import { ModeMenu, PermissionMenu, ReasoningMenu, InteractiveMenu } from './ModeMenu';\r\n", "import { ModeMenu, PermissionMenu } from './ModeMenu';\r\n");
t = t.replace("import { ModeMenu, PermissionMenu, ReasoningMenu, InteractiveMenu } from './ModeMenu';\n", "import { ModeMenu, PermissionMenu } from './ModeMenu';\n");
fs.writeFileSync(P, t, "utf8");
console.log("import dibersihkan");
