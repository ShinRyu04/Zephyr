const fs = require("fs");
const s = fs.readFileSync("src-tauri/src/settings.rs", "utf8").split(/\r?\n/);
const out = [];
s.forEach((l, i) => { if (/emit|settings-changed|patch_settings/.test(l)) out.push((i + 1) + ": " + l.trim().slice(0, 120)); });
fs.writeFileSync("scratch/_st2.txt", out.join("\n"));
console.log(out.length);
