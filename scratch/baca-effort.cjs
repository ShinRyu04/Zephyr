const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts", "utf8").split("\n");
for (const [a,b] of [[5520,5545],[5630,5650]]) {
  console.log("=== " + a + "-" + b + " ===");
  console.log(t.slice(a-1,b).map((l,i)=>(a+i)+": "+l).join("\n"));
}
