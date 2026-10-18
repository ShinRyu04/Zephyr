const fs = require("fs");
let c = fs.readFileSync("src/components/ai/ChatSettingsPage.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";

/* 1) Tombol maximize: bersihkan offset drag + tambah minimize & popout */
const lama = "          <button" + E +
"            className=\"ai-ikon\"" + E +
"            data-testid=\"cset-max\"" + E +
"            title={besar ? tr('Restore size') : tr('Maximize')}" + E +
"            aria-label={besar ? tr('Restore size') : tr('Maximize')}" + E +
"            aria-pressed={besar}" + E +
"            onClick={() => setBesar((v) => !v)}" + E +
"          >" + E +
"            <AiIkon name={besar ? 'restore' : 'maximize'} size={14} />" + E +
"          </button>";
if (!c.includes(lama)) throw new Error("blok max");

c = c.replace(lama,
"          <button" + E +
"            className=\"ai-ikon\"" + E +
"            data-testid=\"cset-min\"" + E +
"            title={tr('Minimize')}" + E +
"            aria-label={tr('Minimize')}" + E +
"            onClick={() => setKecil(true)}" + E +
"          >" + E +
"            <AiIkon name=\"minimize\" size={14} />" + E +
"          </button>" + E +
"          <button" + E +
"            className=\"ai-ikon\"" + E +
"            data-testid=\"cset-max\"" + E +
"            title={besar ? tr('Restore size') : tr('Maximize')}" + E +
"            aria-label={besar ? tr('Restore size') : tr('Maximize')}" + E +
"            aria-pressed={besar}" + E +
"            onClick={() => {" + E +
"              /*" + E +
"               * Clear the drag offset when toggling size." + E +
"               *" + E +
"               * The offset lives in `--drag-x/--drag-y` and is applied as a" + E +
"               * `transform`. Maximizing makes the card fill the viewport, and a" + E +
"               * leftover transform then shifts that full-size box by however" + E +
"               * far the reader had dragged it - which painted the left rail" + E +
"               * over the content pane. Same reason Agent Customizations and AI" + E +
"               * Models clear it in their own maximize buttons." + E +
"               */" + E +
"              const el = document.querySelector('[data-testid=\"cset-pop\"]') as HTMLElement | null;" + E +
"              el?.style.removeProperty('--drag-x');" + E +
"              el?.style.removeProperty('--drag-y');" + E +
"              setBesar((v) => !v);" + E +
"            }}" + E +
"          >" + E +
"            <AiIkon name={besar ? 'restore' : 'maximize'} size={14} />" + E +
"          </button>");

fs.writeFileSync("src/components/ai/ChatSettingsPage.tsx", c);
console.log("tombol ok");
