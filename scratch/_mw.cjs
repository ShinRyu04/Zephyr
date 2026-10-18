const fs = require("fs");
let c = fs.readFileSync("src/main.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";

const a1 = "import AgentsWindow from './AgentsWindow';";
if (!c.includes(a1)) throw new Error("a1");
c = c.replace(a1, a1 + E + "import PanelWindow from './PanelWindow';" + E + "import { panelDariHash } from './lib/panelWindow';");

const a2 = "const Root = hash === 'ai' ? AiWindow : hash === 'agents' ? AgentsWindow : App;";
if (!c.includes(a2)) throw new Error("a2");
c = c.replace(a2,
"/*" + E +
" * A panel in its own window (`#panel=settings|extensions|tools`) is the fourth" + E +
" * root. Checked BEFORE the exact-name comparisons so `#panel=` never has to be" + E +
" * added to every one of them, and parsed by the same function the opener uses," + E +
" * so the two cannot disagree about what a valid id is." + E +
" */" + E +
"const Root = panelDariHash(hash)" + E +
"  ? PanelWindow" + E +
"  : hash === 'ai'" + E +
"    ? AiWindow" + E +
"    : hash === 'agents'" + E +
"      ? AgentsWindow" + E +
"      : App;");

fs.writeFileSync("src/main.tsx", c);
console.log("main ok");
