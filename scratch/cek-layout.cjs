const fs = require("fs");
const t = fs.readFileSync("src/components/agents/AgentsLayout.tsx","utf8");
console.log("pakai AgxStarting/AgentsStarting:", t.includes("AgentsStarting"));
console.log("pakai AgentsConversation:", t.includes("AgentsConversation"));
console.log("masih AiHost:", t.includes("AiHost"));
console.log("import agents-chrome.css:", t.includes("agents-chrome.css"));
