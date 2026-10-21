const fs = require("fs");
const L = fs.readFileSync("src/styles/theme.css", "utf8").split("\n");
console.log(L.slice(8, 45).map((l,i)=>(9+i)+": "+l).join("\n"));
