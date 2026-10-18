const fs = require("fs");
const s = fs.readFileSync("src/components/ai/ChatSettingsPage.tsx", "utf8").split(/\r?\n/);
const out = [];
s.forEach((l, i) => { if (/besar/.test(l)) out.push((i + 1) + ": " + l.trim().slice(0, 100)); });
fs.writeFileSync("scratch/_c1.txt", out.join("\n"));
console.log(out.length);
