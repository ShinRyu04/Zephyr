const fs = require("fs");
const t = fs.readFileSync("src/components/agents/AgentsLayout.tsx","utf8");
console.log("AgentsStarting:", t.includes("AgentsStarting"));
console.log("AgentsConversation:", t.includes("AgentsConversation"));
console.log("AiHost masih dipakai:", /<AiHost/.test(t));
console.log("import agents-chrome.css:", t.includes("agents-chrome.css"));
