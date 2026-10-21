const fs = require("fs");
for (const [f, a, b] of [["src/styles/ai-streaming.css", 398, 412], ["src/styles/ai-panel-compact.css", 1232, 1252]]) {
  console.log("=== " + f + " " + a + "-" + b + " ===");
  const L = fs.readFileSync(f, "utf8").split("\n");
  console.log(L.slice(a-1, b).map((l,i)=>(a+i)+": "+l).join("\n"));
}
