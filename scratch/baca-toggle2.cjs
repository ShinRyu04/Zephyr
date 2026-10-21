const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
let a = -1, b = -1;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes("Show/hide the agent sessions column")) a = i - 1;
  if (a > 0 && L[i].includes("ai-toggle-sessions-side")) {
    for (let k = i; k < L.length; k++) if (L[k].trim() === ")}") { b = k; break; }
    break;
  }
}
console.log("blok", a + 1, "..", b + 1);
console.log(L.slice(a, b + 1).map((l, i) => (a + 1 + i) + ": " + l).join("\n"));
