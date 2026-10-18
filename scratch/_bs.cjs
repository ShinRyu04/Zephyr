const fs = require("fs");
const s = fs.readFileSync("src/lib/store.ts", "utf8").split(/\r?\n/);
const i = s.findIndex((l) => /bootstrap: async/.test(l));
fs.writeFileSync("scratch/_bs.txt", s.slice(i, i + 70).join("\n"));
console.log("baris:", i + 1);
