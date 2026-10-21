const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
t = t.replace(`.ai-input-row .ai-input {
  /* 84, not 72:`, `.ai-input-row .ai-input {
  /*
   * No box of its own.
   *
   * The field carried its own 0.8px border on all four sides and its own
   * --bg fill, which is one step darker than the card. The result was a
   * nested box: a visible rectangle inside the composer, reading as a
   * divider under the placeholder and as a second, darker input. The
   * reference has ONE surface - field and control row share the card's
   * fill with nothing between them.
   */
  border: 0;
  background: transparent;
  /* 84, not 72:`);
fs.writeFileSync(P, t, "utf8");
console.log(/No box of its own/.test(t) ? "ok" : "gagal");
