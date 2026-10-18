const fs = require("fs");
let c = fs.readFileSync("src/lib/extLoader.ts", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";
const awal = c.indexOf("async function muatIconTheme(");
const akhirTanda = "function normalisasiSvg(";
const akhir = c.indexOf(akhirTanda);
if (awal < 0 || akhir < 0) { console.log("TIDAK KETEMU", awal, akhir); process.exit(1); }
const baru = fs.readFileSync("scratch/_muaticon.txt", "utf8");
c = c.slice(0, awal) + baru + c.slice(akhir);
fs.writeFileSync("src/lib/extLoader.ts", c);
console.log("diganti");
