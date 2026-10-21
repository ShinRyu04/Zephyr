const fs = require("fs");
const P = "src/components/agents/AgentsSessions.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = t.includes("\r\n") ? "\r\n" : "\n";
t = t.replace("import { useAgentCustom, type AgentCustomSection } from '../../lib/agentCustomStore';" + NL, "");
fs.writeFileSync(P, t, "utf8");
console.log("ok");
