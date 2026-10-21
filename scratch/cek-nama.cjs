const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const keys = t.match(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*):/gm) || [];
const uniq = [...new Set(keys.map(k=>k.trim().replace(/:$/,"")))];
const cari = uniq.filter(k=>/draft|busy|sibuk|running|stream|kirim/i.test(k));
console.log("kandidat:", cari.join(", "));
