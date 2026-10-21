const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
t = t.replace("  const sesiSisiBuka = useSessionsSide((s) => s.buka);\n", "");
t = t.replace("  const setSesiSisiBuka = useSessionsSide((s) => s.setBuka);\n", "");
t = t.replace("  const sesiSisiBuka = useSessionsSide((s) => s.buka);\r\n", "");
t = t.replace("  const setSesiSisiBuka = useSessionsSide((s) => s.setBuka);\r\n", "");
fs.writeFileSync(P, t, "utf8");
console.log("ok");
