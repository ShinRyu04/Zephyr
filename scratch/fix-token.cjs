const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
const anchor = `.ai-input-row {
  border-radius: 16px;
  border: 0.8px solid var(--border);`;
const ganti = `/*
 * The radius goes through the TOKEN, not the property.
 *
 * A later rule (".ai-input-row:not(.ai-work-stack + .ai-input-row)") sets
 * "border-radius: var(--ai-dock-radius, 10px)" and carries higher
 * specificity than a plain ".ai-input-row" selector, so writing
 * "border-radius: 16px" here lost the cascade and measured 10px live.
 * Setting the variable instead lets every rule that reads it - including the
 * stacked variant that squares the top corners on purpose - agree on 16.
 */
.ai-input-row {
  --ai-dock-radius: 16px;
  border-radius: 16px;
  border: 0.8px solid var(--border);`;
if (t.includes(anchor)) { t = t.replace(anchor, ganti); fs.writeFileSync(P, t, "utf8"); console.log("ok"); }
else console.log("anchor tidak ketemu");
