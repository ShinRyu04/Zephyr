const fs = require("fs");
const s = fs.readFileSync("src/components/ai/ChatSettingsPage.tsx", "utf8").split(/\r?\n/);
fs.writeFileSync("scratch/_c4.txt", s.slice(1448, 1500).map((l, i) => (i + 1449) + ": " + l).join("\n"));
console.log("ok");
