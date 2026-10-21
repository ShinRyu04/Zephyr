const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
const blok = `
/* ══ Starting screen: composer CENTRED, chat pushes it down ═══════════════
 *
 * Measured on the reference (1917x1142 at 1.25 scale => 1534x914 css):
 *
 *   y 287-313  heading
 *   y 368-398  hint line inside the box
 *   y 455-495  control row
 *   y 511-523  "Local <folder>" row - INSIDE the box
 *   y 572-609  category cards
 *
 * The box ends at y 523 of a 914px column, so before a conversation starts it
 * sits in the MIDDLE, not pinned to the bottom. That is the layout difference
 * that matters most: a bottom-docked composer makes the screen read as "chat
 * in progress, empty", while a centred one reads as "start here".
 *
 * As soon as there is a conversation the panel becomes a normal chat: the
 * transcript fills the column and the composer docks at the bottom. Implemented
 * with flex, not with absolute positioning, so the transition needs no JS.
 */
.ai-panel.is-kosong {
  /* The panel becomes a single centred column. */
  --ai-kosong: 1;
}

/* The empty state grows to fill the space above the composer, and the
   composer stops being pushed to the bottom by the scroller. */
.ai-panel.is-kosong .ai-chat {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 0;
}

.ai-panel.is-kosong .ai-empty {
  flex: 0 0 auto;
  margin: 0 auto;
  width: 100%;
  max-width: 760px;
  padding-bottom: 18px;
}

/* No scroller padding in the starting screen: the centred block defines its
   own spacing, and inherited padding would push it off centre. */
.ai-panel.is-kosong .ai-chat > * {
  flex-shrink: 0;
}
`;
if (!t.includes("Starting screen: composer CENTRED")) {
  fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
  console.log("css tengah ditambah");
} else console.log("sudah ada");
