const fs = require("fs");
const t = fs.readFileSync("src/styles/agents-window.css", "utf8");
const L = t.split("\n");
console.log("total baris:", L.length);
L.forEach((l,i)=>{ if(/^\S.*\{\s*$/.test(l) || /^\/\* ──/.test(l)) console.log((i+1)+": "+l.trim()); });
