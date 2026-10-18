const fs = require("fs");
let c = fs.readFileSync("src/PanelWindow.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";
const a = "import { panelDariHash } from './lib/panelWindow';";
if (!c.includes(a)) throw new Error("a");
c = c.replace(a, a + E + "import './styles/theme.css';" + E + "import './styles/tokens.css';" + E + "import './styles/settings.css';" + E + "import './styles/extensions.css';" + E + "import './styles/tools.css';" + E + "import './styles/modal-popup.css';" + E + "import './index.css';");
fs.writeFileSync("src/PanelWindow.tsx", c);
console.log("import css ok");
