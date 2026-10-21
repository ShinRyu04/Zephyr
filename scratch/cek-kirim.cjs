const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const i = t.indexOf("kirimSekarang: async");
console.log(t.slice(i, i + 1600));
