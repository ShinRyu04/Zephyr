const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");

// 1. container query untuk responsif
t = t.replace(`.ai-input-row {
  --ai-dock-radius: 16px;`,
`.ai-input-row {
  /* The control row below adapts to the space it actually gets. A container
     query is the honest tool here: the same composer is 319px in the docked
     panel and 1206px when maximised, and one fixed gap cannot serve both -
     measured at 340px the row overflowed its own box by 111px. */
  container-type: inline-size;
  container-name: composer;
  --ai-dock-radius: 16px;`);

// 2. default (panel sempit): kontrol diringkas
t = t.replace(`.ai-input-row .ai-input-toolbar .mode-btn,
.ai-input-row .ai-input-toolbar .ai-model-btn {
  height: 32px;
  /* The 10px is what makes neighbouring labels read as 24px apart while the
     boxes stay 4px apart - see the gap note on the toolbar above. */
  padding: 0 10px;`,
`.ai-input-row .ai-input-toolbar .mode-btn,
.ai-input-row .ai-input-toolbar .ai-model-btn {
  height: 32px;
  /* The 10px is what makes neighbouring labels read as 24px apart while the
     boxes stay 4px apart - see the gap note on the toolbar above. In the
     NARROW panel the 10px becomes 6px: measured at 340px the row overflowed
     by 111px, and the overflow is what made the three controls look crammed
     together instead of evenly spaced. */
  padding: 0 6px;`);

t = t.replace(`  max-width: 132px;`, `  max-width: 104px;`);

fs.writeFileSync(P, t, "utf8");
console.log("container:", /container-name: composer/.test(t), "pad6:", /padding: 0 6px;/.test(t), "model104:", /max-width: 104px;/.test(t));
