const fs = require("fs");
const t = fs.readFileSync("src-tauri/src/main.rs","utf8");
const m = t.match(/.*9223.*/g) || [];
console.log("baris 9223 di main.rs:", m.length);
m.slice(0,6).forEach(x=>console.log("  " + x.trim()));
