const fs = require("fs");
const L = fs.readFileSync("src/components/ai/AiPanel.tsx", "utf8").split("\n");
// baris 2422 (index 2421) = penutup ai-input-row, 2423 (2422) = penutup wrapper
console.log("2421:", JSON.stringify(L[2421]));
console.log("2422:", JSON.stringify(L[2422]));
console.log("2423:", JSON.stringify(L[2423]));
