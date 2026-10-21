const fs = require("fs");
const t = fs.readFileSync("src/styles/ai-streaming.css", "utf8").split("\n");
console.log(t.slice(920, 960).map((l,i)=>(921+i)+": "+l).join("\n"));
