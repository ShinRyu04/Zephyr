const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const m = t.match(/export (interface|type) \w*(Msg|Pesan|Message)\w*/g) || [];
console.log("tipe:", [...new Set(m)].join(" | "));
const i = t.indexOf("messages: ");
const seg = t.slice(Math.max(0,i-1200), i+200);
console.log("--- konteks ---");
console.log(seg);
