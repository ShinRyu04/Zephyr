const fs = require("fs");
const s = fs.readFileSync("src/styles/ai.css", "utf8").split(/\r?\n/);
console.log("=== 6505-6530 ===");
console.log(s.slice(6504, 6530).join("\n"));
console.log("=== 9625-9700 ===");
console.log(s.slice(9624, 9700).join("\n"));
