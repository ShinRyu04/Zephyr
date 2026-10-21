const fs = require("fs");
const t = fs.readFileSync("src/styles/agents-window.css", "utf8");
const L = t.split("\n");
L.forEach((l, i) => {
  if (/ai-input-row|ai-empty|ai-saran|ai-panel|is-kosong/.test(l) && l.includes("{")) {
    console.log((i+1) + ": " + l.trim());
  }
});
