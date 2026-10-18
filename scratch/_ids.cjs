const fs = require("fs");
const s = fs.readFileSync("src/lib/types.ts", "utf8").split(/\r?\n/);
s.forEach((l, i) => { if (/hydraTerakhir/i.test(l)) console.log(i + 1, l.trim().slice(0, 130)); });
console.log("=== konteks ===");
const i = s.findIndex((l) => /hydraTerakhir/i.test(l));
console.log(s.slice(Math.max(0, i - 25), i + 20).join("\n"));
