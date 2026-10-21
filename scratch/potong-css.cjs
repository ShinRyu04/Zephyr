const fs = require("fs");
const P = "src/styles/agents-window.css";
const L = fs.readFileSync(P, "utf8").split("\n");
// pertahankan sampai baris 1706 (indeks 1705), buang 1707..akhir yang bertabrakan
const simpan = L.slice(0, 1706);
while (simpan.length && simpan[simpan.length-1].trim() === "") simpan.pop();
fs.writeFileSync(P, simpan.join("\n") + "\n", "utf8");
console.log("dipotong jadi", simpan.length, "baris");
