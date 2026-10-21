const fs = require("fs");
const L = fs.readFileSync("src/index.css", "utf8").split("\n");
console.log("=== .resizer 690-712 ===");
console.log(L.slice(689, 712).map((l,i)=>(690+i)+": "+l).join("\n"));
console.log("=== sidebar-pos-right 360-372 ===");
console.log(L.slice(359, 372).map((l,i)=>(360+i)+": "+l).join("\n"));
