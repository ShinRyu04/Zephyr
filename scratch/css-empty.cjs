const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
const blok = `
/* ══ Empty state: the reference's launch screen ══════════════════════════
 *
 * Measured on the reference bitmap (1917x1138 at 1.25 scale):
 *   heading  y 267, 26px tall of glyph, bright (#E5E5E5)
 *   hairline y 348
 *   tagline  y 370, 13px, dim (#666B75)
 *
 * The hairline under the heading is the detail that makes the two screens
 * read as the same design: the heading is a HEADER for the screen, not a
 * floating title, and the rule is what says so.
 */
.ai-empty-judul {
  margin: 0 0 10px;
  padding: 0;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--text);
  text-align: center;
}

.ai-empty-tagline {
  margin: 0 auto;
  padding-bottom: 14px;
  max-width: 640px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
  text-align: center;
}

/* The four category cards sit in ONE row under the composer, the way the
   reference lays them out - not stacked as three full-width rows. */
.ai-empty .ai-saran {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  max-width: 720px;
  margin: 16px auto 0;
}

.ai-empty .ai-saran-kartu {
  display: flex;
  align-items: flex-start;
  padding: 10px 12px;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  text-align: left;
}

.ai-empty .ai-saran-kartu:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

.ai-empty .ai-saran-teks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-empty .ai-saran-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
}

.ai-empty .ai-saran-sub {
  font-size: 11.5px;
  line-height: 1.35;
  color: var(--text-muted);
}

/* Below 520px the four columns stop fitting; two rows of two is what the
   reference itself does when the column narrows. */
@container composer (max-width: 519px) {
  .ai-empty .ai-saran {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`;
if (!t.includes("Empty state: the reference's launch screen")) {
  fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
  console.log("css empty state ditambah");
} else console.log("sudah ada");
