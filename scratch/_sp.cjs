const fs = require("fs");
let c = fs.readFileSync("src/components/shell/ShellPopups.tsx", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";

c = c.replace("      testid=\"settings-pop\"" + E, "      testid=\"settings-pop\"" + E + "      panelId=\"settings\"" + E);
c = c.replace("      testid=\"extensions-pop\"" + E, "      testid=\"extensions-pop\"" + E + "      panelId=\"extensions\"" + E);
c = c.replace("      testid=\"tools-pop\"" + E, "      testid=\"tools-pop\"" + E + "      panelId=\"tools\"" + E);

fs.writeFileSync("src/components/shell/ShellPopups.tsx", c);
console.log("shellpopups ok");
