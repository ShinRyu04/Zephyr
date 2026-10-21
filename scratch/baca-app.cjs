const fs = require("fs");
const t = fs.readFileSync("src/App.tsx", "utf8").split("\n");
console.log(t.slice(130, 150).map((l,i)=>(131+i)+": "+l).join("\n"));
