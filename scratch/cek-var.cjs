const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiPanel.tsx","utf8");
for (const k of ["workspace","pilihFolder","akarFolder","namaFolder","rootName","gitBranch","const akar"]) {
  const re = new RegExp("^.*"+k+".*$","gm");
  const m = t.match(re) || [];
  console.log("=== "+k+" ("+m.length+") ===");
  console.log(m.slice(0,6).join("\n"));
}
