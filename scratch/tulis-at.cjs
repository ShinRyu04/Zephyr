const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
const blok = `
/* The "@" that marks the agent picker. Text, not an icon file: it is a
   character the font already has, so it inherits the chip's size and colour
   and needs no asset. */
.ai-input-row .ai-input-toolbar .mode-btn .pick-at {
  font-size: 14px;
  line-height: 1;
  opacity: 0.75;
  flex-shrink: 0;
}
`;
if (!t.includes("marks the agent picker")) {
  fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
  console.log("ok");
} else console.log("sudah ada");
