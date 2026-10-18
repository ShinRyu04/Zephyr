const fs = require("fs");
const lines = fs.readFileSync("src/styles/chat-settings.css", "utf8").split(/\r?\n/);
const E = fs.readFileSync("src/styles/chat-settings.css", "utf8").includes("\r\n") ? "\r\n" : "\n";
// cari baris awal: baris yang mengandung "The overlay home."
const iAwal = lines.findIndex((l) => l.includes("The overlay home."));
const iAkhir = lines.findIndex((l) => l.includes("Scope tabs (User / Workspace)"));
console.log("iAwal", iAwal, "iAkhir", iAkhir);
console.log("baris awal-1:", JSON.stringify(lines[iAwal - 1]));
console.log("baris akhir-1:", JSON.stringify(lines[iAkhir - 1]));
