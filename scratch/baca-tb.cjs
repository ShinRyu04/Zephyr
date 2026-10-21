const fs = require("fs");
const t = fs.readFileSync("src/styles/ai.css", "utf8").split("\n");
console.log(t.slice(2878, 2960).map((l,i)=>(2879+i)+": "+l).join("\n"));
