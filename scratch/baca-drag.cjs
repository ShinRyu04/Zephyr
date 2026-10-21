const fs = require("fs");
const L = fs.readFileSync("src/App.tsx", "utf8").split("\n");
console.log(L.slice(525, 560).map((l,i)=>(526+i)+": "+l).join("\n"));
