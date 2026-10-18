const fs = require("fs");
let c = fs.readFileSync("src/components/shell/ActivityBar.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";

/* import */
const a1 = "import type { ActivityId } from '../../lib/types';";
if (!c.includes(a1)) throw new Error("a1");
c = c.replace(a1, a1 + E + "import { bukaPanel } from '../../lib/bukaPanel';");

/* extensions */
const a2 = "              if (id === 'extensions') {" + E +
"                setExtensionsOpen(!useStore.getState().extensionsOpen);" + E +
"                return;" + E +
"              }" + E +
"              if (id === 'tools') {" + E +
"                setToolsOpen(!useStore.getState().toolsOpen);" + E +
"                return;" + E +
"              }";
if (!c.includes(a2)) throw new Error("a2");
c = c.replace(a2,
"              /*" + E +
"               * Extensions and Tools open as WINDOWS, not popups." + E +
"               *" + E +
"               * They used to float over the editor, and when maximized their" + E +
"               * own chrome fought their layout: the left rail was painted over" + E +
"               * the content. A settings or marketplace page is a surface the" + E +
"               * reader keeps beside their code, so it gets a real window with" + E +
"               * the platform's own maximize/minimize." + E +
"               */" + E +
"              if (id === 'extensions') {" + E +
"                bukaPanel('extensions');" + E +
"                return;" + E +
"              }" + E +
"              if (id === 'tools') {" + E +
"                bukaPanel('tools');" + E +
"                return;" + E +
"              }");

/* gear */
const a3 = "        onClick={() => setSettingsOpen(!settingsOpen)}";
if (!c.includes(a3)) throw new Error("a3");
c = c.replace(a3, "        onClick={() => bukaPanel('settings')}");

fs.writeFileSync("src/components/shell/ActivityBar.tsx", c);
console.log("activitybar ok");
