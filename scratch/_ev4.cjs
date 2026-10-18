const fs = require("fs");
const s = fs.readFileSync("src/App.tsx", "utf8").split(/\r?\n/);
const out = [];
s.forEach((l, i) => { if (/onSettingsChanged|onWorkspaceOpened|import.*events/.test(l)) out.push((i + 1) + ": " + l.trim().slice(0, 120)); });
console.log(out.length ? out.join("\n") : "(tidak ada)");
