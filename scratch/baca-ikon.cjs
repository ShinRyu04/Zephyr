const fs = require("fs");
const t = fs.readFileSync("src/components/ai/AiIkon.tsx", "utf8");
const m = t.match(/^\s{2}'?([a-z-]+)'?:/gm);
console.log("ikon:", (m||[]).map(s=>s.trim().replace(/:$/,"")).join(" "));
