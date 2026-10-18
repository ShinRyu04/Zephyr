const fs = require("fs");
let c = fs.readFileSync("src/components/ai/ChatSettingsPage.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";

/* Buang tombol minimize dari page: minimize milik FRAME (ChatSettingsPopup),
   bukan halaman - halaman juga dipakai sebagai TAB editor, di mana tidak ada
   yang bisa diminimize. */
const min = "          <button" + E +
"            className=\"ai-ikon\"" + E +
"            data-testid=\"cset-min\"" + E +
"            title={tr('Minimize')}" + E +
"            aria-label={tr('Minimize')}" + E +
"            onClick={() => setKecil(true)}" + E +
"          >" + E +
"            <AiIkon name=\"minimize\" size={14} />" + E +
"          </button>" + E;
if (!c.includes(min)) throw new Error("tombol min");
c = c.replace(min, "");

/* Fragment tidak lagi diperlukan */
c = c.replace("        {onDragStart && (" + E + "          <>" + E, "        {onDragStart && (" + E);
c = c.replace("          </>" + E + "        )}", "        )}");

fs.writeFileSync("src/components/ai/ChatSettingsPage.tsx", c);
console.log("page ok");
