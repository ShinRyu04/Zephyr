const fs = require("fs");
let c = fs.readFileSync("src/components/ai/AiIkon.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";

/* tambah nama ikon */
const a1 = "    | 'maximize'";
if (!c.includes(a1)) throw new Error("a1");
c = c.replace(a1, "    | 'maximize'" + E + "    | 'minimize'");

/* tambah case */
const a2 = "    case 'restore':";
if (!c.includes(a2)) throw new Error("a2");
c = c.replace(a2, "    // Minimize: a single bar, the title-bar glyph.\n    case 'minimize':" + E +
"      return (" + E +
"        <svg {...box}>" + E +
"          <path d=\"M2.4 8h11.2\" />" + E +
"        </svg>" + E +
"      );" + E +
a2);

fs.writeFileSync("src/components/ai/AiIkon.tsx", c);
console.log("ikon ok");
