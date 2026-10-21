const fs = require("fs");
const P = "src/styles/agents-window.css";
let t = fs.readFileSync(P, "utf8");
const blok = `
/* The three navigation rows under "New task".
 *
 * Reference measurements: same 34px height as the primary row, a 16px icon,
 * a 14px label, and NO background - they are destinations, not buttons. The
 * only thing that changes on hover is the label colour, which is how the
 * reference separates "where can I go" from "what do I do".
 */
.ag-sesi-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  margin-top: 2px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.ag-sesi-nav:hover {
  background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--text);
}
.ag-sesi-nav-ic {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.85;
}
.ag-sesi-nav-teks {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
if (!t.includes("The three navigation rows under")) {
  fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
  console.log("css nav ditambah");
} else console.log("sudah ada");
