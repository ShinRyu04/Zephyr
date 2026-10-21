const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");

t = t.replace(`  /* 24px, measured between the control clusters on the reference bitmap:
     "+" to the approval chip is 24px of clean background, approval to agent
     25, agent to model 25. This row was at 6px, which is what made the three
     controls read as one smudge rather than three separate buttons. */
  gap: 24px;`,
`  /*
   * 4px BETWEEN buttons, ~10px of padding INSIDE each one.
   *
   * This is the detail that took two passes to get right. On the reference
   * bitmap the visible gap between one label and the next is 24-25px, but
   * that is content-to-content: the buttons themselves sit 4px apart and
   * carry the rest as internal padding, with no background of their own.
   * Setting gap:24px instead reproduced the spacing at the wrong layer - it
   * looked right in a wide panel and overflowed the box by 95px at 340px,
   * because the padding was never there to absorb it.
   */
  gap: 4px;`);

t = t.replace(`.ai-input-row .ai-input-toolbar .mode-btn,
.ai-input-row .ai-input-toolbar .ai-model-btn {
  height: 32px;
  padding: 0 8px;`,
`.ai-input-row .ai-input-toolbar .mode-btn,
.ai-input-row .ai-input-toolbar .ai-model-btn {
  height: 32px;
  /* The 10px is what makes neighbouring labels read as 24px apart while the
     boxes stay 4px apart - see the gap note on the toolbar above. */
  padding: 0 10px;`);

t = t.replace(`  max-width: 150px;`, `  max-width: 132px;`);

fs.writeFileSync(P, t, "utf8");
console.log("gap4:", /gap: 4px;/.test(t), "pad10:", /padding: 0 10px;/.test(t), "model132:", /max-width: 132px;/.test(t));
