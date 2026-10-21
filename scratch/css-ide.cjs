const fs = require("fs");
const P = "src/styles/agents-window.css";
let t = fs.readFileSync(P, "utf8");
const blok = `
/* The "IDE" chip: top-right of the chat canvas.
 *
 * The reference puts one small button here instead of a right panel, so this
 * sits absolutely inside the centre column and must not take part in the chat
 * layout. Quiet by default - it is an escape hatch, not a primary action -
 * and it only gains contrast on hover.
 */
.ag-center {
  position: relative;
}
.ag-ide-chip {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--text) 5%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.ag-ide-chip:hover {
  background: color-mix(in srgb, var(--text) 10%, transparent);
  color: var(--text);
}
.ag-ide-chip-ic {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.9;
}
`;
if (!t.includes("The \"IDE\" chip: top-right of the chat canvas")) {
  fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
  console.log("css ide chip ditambah");
} else console.log("sudah ada");
