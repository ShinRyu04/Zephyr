const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
const blok = `
/* ══ The folder row under the composer ══════════════════════════════════
 *
 * The reference puts it there: "Local" as a plain label, then the folder as
 * the action. Measured on its bitmap at y 594..605 - a 13px row sitting
 * ~6px under the box, centred on the same axis as the composer.
 */
.ai-folder-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.ai-folder-label {
  flex-shrink: 0;
  color: var(--text-muted);
}

.ai-folder-pilih {
  max-width: 340px;
  padding: 2px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.ai-folder-pilih:hover {
  background: color-mix(in srgb, var(--text) 7%, transparent);
  color: var(--text);
}
`;
if (!t.includes("The folder row under the composer")) {
  fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
  console.log("css folder row ditambah");
} else console.log("sudah ada");
