const fs = require("fs");
const t = fs.readFileSync("src/styles/ai-streaming.css", "utf8").split("\n");
console.log(t.slice(424, 545).map((l,i)=>(425+i)+": "+l).join("\n"));
