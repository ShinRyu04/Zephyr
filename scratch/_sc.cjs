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
const out = [];
for (const f of walk("src")) {
  const s = fs.readFileSync(f, "utf8").split(/\r?\n/);
  s.forEach((l, i) => {
    if (/settings-changed/.test(l)) out.push(f + ":" + (i + 1) + ": " + l.trim().slice(0, 110));
  });
}
fs.writeFileSync("scratch/_sc.txt", out.join("\n"));
console.log(out.length);
