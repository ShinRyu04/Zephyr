const fs = require("fs");
let c = fs.readFileSync("src/components/ai/ChatSettingsPopup.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";
c = c.replace("import { useT } from '../../lib/i18n';" + E, "");
c = c.replace("  const tr = useT();" + E, "");
c = c.replace(E + E + "/** Shared title used by the dock strip and the popup's accessible name. */" + E + "export const JUDUL_CSET = 'Chat Settings';" + E + E + "/** Re-exported so a dock can render the same label the page does. */" + E + "export function judulChatSettings(tr: (k: string) => string): string {" + E + "  return tr(JUDUL_CSET);" + E + "}" + E, "");
fs.writeFileSync("src/components/ai/ChatSettingsPopup.tsx", c);
console.log("popup ok");
