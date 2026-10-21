const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");

t = t.replace(`.ai-input-row .ai-input-toolbar {
  border-top: 0;
  height: 52px;
  box-sizing: border-box;
  padding: 8px 12px 12px;
  gap: 6px;
  flex-wrap: nowrap;
}`,
`.ai-input-row .ai-input-toolbar {
  border-top: 0;
  height: 52px;
  box-sizing: border-box;
  padding: 8px 12px 12px;
  /* 24px, measured between the control clusters on the reference bitmap:
     "+" to the approval chip is 24px of clean background, approval to agent
     25, agent to model 25. This row was at 6px, which is what made the three
     controls read as one smudge rather than three separate buttons. */
  gap: 24px;
  flex-wrap: nowrap;
}`);

t = t.replace(`.ai-input-row .ai-model-btn {
  max-width: 132px;
}`,
`.ai-input-row .ai-model-btn {
  /* 110, not 132: at a 24px gap the row needs the room. The reference's
     model chip is 122px for a 17-character id; 110 keeps ours on one line
     and lets a longer id ellipsize rather than push the row into a wrap. */
  max-width: 110px;
}`);

fs.writeFileSync(P, t, "utf8");
console.log("gap24:", /gap: 24px;/.test(t), "model110:", /max-width: 110px;/.test(t));
