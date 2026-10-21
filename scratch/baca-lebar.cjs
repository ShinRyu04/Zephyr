const fs = require("fs");
const L = fs.readFileSync("src/App.tsx", "utf8").split("\n");
console.log(L.slice(1618, 1660).map((l,i)=>(1619+i)+": "+l).join("\n"));
