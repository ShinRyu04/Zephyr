const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
t = t.replace(`.ai-input-row .ai-input-toolbar .ai-round-btn.is-send:disabled {
  background: rgba(50, 240, 140, 0.1);
  color: rgba(50, 240, 140, 0.45);
}`,
`.ai-input-row .ai-input-toolbar .ai-round-btn.is-send:disabled {
  /* Still a VISIBLE green square while the field is empty. At 0.1 alpha the
     button disappeared into the card entirely - a screenshot of the empty
     composer reported "no send button" - which is worse than a dim one: the
     control has to be findable before it is usable. */
  background: rgba(50, 240, 140, 0.16);
  color: rgba(50, 240, 140, 0.6);
  cursor: default;
}`);
fs.writeFileSync(P, t, "utf8");
console.log(/0\.16/.test(t) ? "ok" : "gagal");
