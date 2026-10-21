const fs = require("fs");
const P = "src/styles/agents-window.css";
const L = fs.readFileSync(P, "utf8").split("\n");
console.log("total baris:", L.length);
for (let i = 1695; i < 1730; i++) console.log((i+1) + ": " + L[i]);
