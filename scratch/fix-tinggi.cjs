const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
t = t.replace(`.ai-input-row .ai-input {
  min-height: 72px;`, `.ai-input-row .ai-input {
  /* 84, not 72: the reference box is 138px tall, and with a 52px control row
     and a 1px border top and bottom that leaves exactly 84 for the field.
     Measured on the reference bitmap - the box's inner area runs y=18..152,
     with the control row occupying the last 52px of it. */
  min-height: 84px;`);
fs.writeFileSync(P, t, "utf8");
console.log(/min-height: 84px/.test(t) ? "ok" : "gagal");
