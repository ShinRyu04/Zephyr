const fs = require("fs");
let c = fs.readFileSync("src/components/ai/ChatSettingsPage.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";

const lama = "        {onDragStart && (" + E + "          <button" + E + "            className=\"ai-ikon\"" + E + "            data-testid=\"cset-min\"";
if (!c.includes(lama)) throw new Error("lama");
c = c.replace(lama, "        {onDragStart && (" + E + "          <>" + E + "          <button" + E + "            className=\"ai-ikon\"" + E + "            data-testid=\"cset-min\"");

const lama2 = "            <AiIkon name={besar ? 'restore' : 'maximize'} size={14} />" + E + "          </button>" + E + "        )}";
if (!c.includes(lama2)) throw new Error("lama2");
c = c.replace(lama2, "            <AiIkon name={besar ? 'restore' : 'maximize'} size={14} />" + E + "          </button>" + E + "          </>" + E + "        )}");

fs.writeFileSync("src/components/ai/ChatSettingsPage.tsx", c);
console.log("fragment ok");
