const fs = require("fs");
const t = fs.readFileSync("src/components/ai/ChatSettingsPage.tsx", "utf8").split("\n");
console.log(t.slice(337, 378).map((l,i)=>(338+i)+": "+l).join("\n"));
