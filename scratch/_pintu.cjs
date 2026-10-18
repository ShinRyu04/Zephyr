const fs = require("fs"), path = require("path");
function walk(d) {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const pola = [
  ["AI Models", /useAiModels\.getState\(\)\.buka|useAiModels\(\(s\) => s\.buka\)/],
  ["Chat Settings", /useAiChatSettings\.getState\(\)\.(bukaDi|setBuka)|useAiChatSettings\(\(s\) => s\.buka\)/],
  ["Agent Custom", /useAgentCustom\.getState\(\)\.buka|useAgentCustom\(\(s\) => s\.open\)/],
];
for (const [nama, re] of pola) {
  console.log("=== " + nama + " ===");
  for (const f of walk("src")) {
    const s = fs.readFileSync(f, "utf8").split(/\r?\n/);
    s.forEach((l, i) => { if (re.test(l)) console.log("  " + f + ":" + (i + 1) + ": " + l.trim().slice(0, 100)); });
  }
}
