const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts", "utf8");
let i = t.indexOf("activeSession:");
while (i >= 0) {
  const potong = t.slice(i, i+60);
  if (!potong.includes("() => ChatSession")) { console.log("@"+i+": "+potong.replace(/\n/g," ")); }
  i = t.indexOf("activeSession:", i+1);
}
