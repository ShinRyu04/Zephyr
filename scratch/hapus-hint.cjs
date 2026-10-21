const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
const L = fs.readFileSync(P, "utf8").split("\n");
// hapus <p className="ai-composer-hint"> ... </p>
let a = -1, b = -1;
for (let i = 0; i < L.length; i++) {
  if (L[i].includes('className="ai-composer-hint"')) { a = i; break; }
}
if (a >= 0) {
  for (let i = a; i < L.length; i++) if (L[i].includes("</p>")) { b = i; break; }
}
console.log("hint baris", a+1, "sampai", b+1);
if (a >= 0 && b > a) L.splice(a, b - a + 1);
fs.writeFileSync(P, L.join("\n"), "utf8");
console.log("dihapus:", !fs.readFileSync(P,"utf8").includes("ai-composer-hint"));
