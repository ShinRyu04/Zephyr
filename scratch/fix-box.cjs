const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");

// 1. kotak: bg lebih terang dari panel + border #3F4046 1px
t = t.replace(`.ai-input-row {
  --ai-dock-radius: 16px;
  border-radius: 16px;
  border: 0.8px solid var(--border);`,
`.ai-input-row {
  --ai-dock-radius: 16px;
  border-radius: 16px;
  /* Measured on the reference: the box is LIGHTER than the page behind it
     (#202124 on #1A1B1D, a 6-step lift) and its border is a mid grey
     (#3F4046), not a near-invisible hairline. Drawn here as a lift off
     --bg rather than a hardcoded grey, so a light theme still works. */
  border: 1px solid color-mix(in srgb, var(--text) 26%, var(--bg));`);

t = t.replace(`  background: var(--bg);
}

/* The tip strip is the card's header: same hairline the reference draws
   between its header row and the field. */
.ai-input-row .ai-tip-strip {
  border-bottom: 0.8px solid var(--border);
}`,
`  background: color-mix(in srgb, var(--text) 4%, var(--bg));
}`);

// 2. toolbar tanpa garis atas
t = t.replace(`.ai-input-row .ai-input-toolbar {
  height: 52px;`,
`.ai-input-row .ai-input-toolbar {
  border-top: 0;
  height: 52px;`);

fs.writeFileSync(P, t, "utf8");
console.log("bg:", /color-mix\(in srgb, var\(--text\) 4%, var\(--bg\)\)/.test(t));
console.log("border:", /color-mix\(in srgb, var\(--text\) 26%, var\(--bg\)\)/.test(t));
console.log("tipstrip rule:", /\.ai-input-row \.ai-tip-strip/.test(t));
