const fs = require("fs");
const s = fs.readFileSync("src/components/settings/AgentCustomModal.tsx", "utf8");
const i = s.indexOf('data-testid="agc-max"');
fs.writeFileSync("scratch/_c8.txt", s.slice(i - 900, i + 900));
console.log("ok");
