const fs = require("fs");
const P = "src/styles/agents-window.css";
let t = fs.readFileSync(P, "utf8");

const blok = `
/* ══ LAYER 2: the chat panel is BLACK, and the composer is CENTRED ══════
 *
 * Measured on 1.1.png (1917x1142 at 1.25 => 1534x914 css):
 *
 *   y 287-313   "Build With TRAE"
 *   y 455-495   control row inside the box
 *   y 511-523   "Local <folder>" row - bottom edge of the box
 *   y 572-609   category cards
 *
 * The box ENDS at y 523 of a 914px column. So before a conversation the
 * composer sits in the MIDDLE of the canvas, and only drops to the bottom
 * once there is a transcript. Two different layouts, chosen by whether the
 * chat is empty - not one layout with an empty state in it.
 *
 * The panel itself is #171717 - the SAME colour as the canvas, not the blue
 * #0d1117 the global theme uses. The reference's chat surface is neutral
 * black; a blue-tinted panel is the single most obvious difference.
 */
.ag-center .ai-panel {
  background: #171717;
  color: #e5e5e5;
}

/* The transcript and the composer share that one surface - no lighter box. */
.ag-center .ai-chat {
  background: transparent;
}

/* ── Starting screen: centre the composer ──────────────────────────────── */

.ag-center .ai-panel.is-kosong {
  display: flex;
  flex-direction: column;
}

.ag-center .ai-panel.is-kosong .ai-chat {
  /* The empty state stops being a scroller and becomes a centred column. */
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: visible;
  padding-bottom: 0;
}

.ag-center .ai-panel.is-kosong .ai-empty {
  flex: 0 0 auto;
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
  padding: 0 0 20px;
}

/* The composer card keeps the canvas colour: the reference draws it with a
   hairline only, and a lighter fill is what made it read as a separate box
   floating on the panel. */
.ag-center .ai-input-row {
  background: #171717;
  border-color: rgba(229, 229, 229, 0.14);
}

/* ── "Local <folder>": the LAST row inside the box ─────────────────────── */

.ag-center .ai-local-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 12px 4px;
  font-size: 12.5px;
  color: #737373;
}

.ag-center .ai-local-label {
  flex-shrink: 0;
  color: #737373;
}

.ag-center .ai-local-pilih {
  max-width: 320px;
  padding: 1px 5px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #a3a3a3;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.ag-center .ai-local-pilih:hover {
  background: rgba(229, 229, 229, 0.08);
  color: #e5e5e5;
}
`;

if (!t.includes("LAYER 2: the chat panel is BLACK")) {
  fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
  console.log("css layer2 ditambah");
} else console.log("sudah ada");
