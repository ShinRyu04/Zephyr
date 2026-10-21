const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");

const blok = `
/* ══ Composer card: the TRAE-measured geometry ═══════════════════════════
 *
 * CLEAN-ROOM NOTE. Every number below came from a CDP probe of a live
 * reference window (a 486x138 composer, radius 16, bottom row 485x52,
 * 32x32 controls with radius 8, 14px labels, a 32x32 send tinted green).
 * Nothing was copied from that product: no CSS, no class names, no assets,
 * no SVG. Only measurements crossed over, and the declarations here are
 * written against Zephyr's own tokens and selectors.
 *
 * Why this block sits at the END of ai-streaming.css: the file is imported
 * after ai.css and ai-panel-compact.css (App.tsx), so these rules win the
 * cascade without a single !important. The old shapes they replace are
 * untouched, which keeps the editor's OTHER surfaces from moving.
 *
 * The card is built as: hairline tip strip + 72px field + 52px control row,
 * inside one 16px-radius border. Those three heights are the reference's,
 * not a guess: 12 (tip) + 72 (field) + 52 (row) = 136, and the reference
 * box measured 138 with a 0.8px border top and bottom.
 */
.ai-input-row {
  border-radius: 16px;
  border: 0.8px solid var(--border);
  /* The card sits on the panel, so it takes the panel's own surface rather
     than a second lighter one - the reference does the same, and a brighter
     box on a dark panel reads as a focused input even when it is not. */
  background: var(--bg);
}

/* The tip strip is the card's header: same hairline the reference draws
   between its header row and the field. */
.ai-input-row .ai-tip-strip {
  border-bottom: 0.8px solid var(--border);
}

/* The field: 72px tall in the reference (4 + 40 + 2 padding around a 40px
   editable line at 13px). Kept as min-height so a long draft still grows -
   the reference scrolls instead, but a growing box is the behaviour this
   composer already promised. */
.ai-input-row .ai-input {
  min-height: 72px;
  padding: 4px 14px 2px 16px;
  font-size: 13px;
  line-height: 1.5;
}

/* The control row: 52px tall, 8/12/12 padding, 6px between controls. */
.ai-input-row .ai-input-toolbar {
  height: 52px;
  box-sizing: border-box;
  padding: 8px 12px 12px;
  gap: 6px;
  flex-wrap: nowrap;
}

/* Attach button: 32x32, radius 8 - the first control on the row. */
.ai-input-row .ai-plus {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

/* Approval and model triggers share one shape: 32px tall, radius 8, 14px
   label. They are the two controls that carry text, so they must match. */
.ai-input-row .ai-input-toolbar .mode-btn,
.ai-input-row .ai-input-toolbar .ai-model-btn {
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 14px;
  gap: 4px;
  white-space: nowrap;
}

/* The model name is the longest text on the row. In a 340px panel the full
   id plus the approval label overflowed and wrapped the row onto a second
   line; a 132px cap keeps one line and lets a long id ellipsize instead. */
.ai-input-row .ai-model-btn {
  max-width: 132px;
}
.ai-input-row .ai-model-btn > span:first-child,
.ai-input-row .ai-model-btn .ai-model-nama {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Send: square, 32x32, radius 8, green. The reference's send is a tinted
   square with a bright arrow, not a filled circle - the tint keeps it
   legible while the field is empty (disabled) without turning grey. */
.ai-input-row .ai-send-wrap {
  gap: 6px;
}
.ai-input-row .ai-input-toolbar .ai-round-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}
.ai-input-row .ai-input-toolbar .ai-round-btn.is-send {
  background: rgba(50, 240, 140, 0.2);
  color: #32f08c;
}
.ai-input-row .ai-input-toolbar .ai-round-btn.is-send:hover:not(:disabled) {
  background: rgba(50, 240, 140, 0.32);
}
.ai-input-row .ai-input-toolbar .ai-round-btn.is-send:disabled {
  background: rgba(50, 240, 140, 0.1);
  color: rgba(50, 240, 140, 0.45);
}
`;

if (!t.includes("Composer card: the TRAE-measured geometry")) {
  t = t.replace(/\s*$/, "\n") + blok;
  fs.writeFileSync(P, t, "utf8");
  console.log("blok ditambahkan, panjang:", t.length);
} else {
  console.log("blok sudah ada");
}
