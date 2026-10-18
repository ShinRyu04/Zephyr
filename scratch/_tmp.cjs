const fs = require("fs");
let c = fs.readFileSync("src/styles/ai.css", "utf8");
const E = c.includes("\r\n") ? "\r\n" : "\n";
function ganti(nama, alasan) {
  const re = new RegExp("(^|\\n)\\/\\*[\\s\\S]*?\\*\\/\\s*\\.modal\\.agc-modal\\s*\\{[^}]*\\}", "m");
  return re;
}
const blok = [
  ["  .agc-backdrop {", "  /*\n   * .agc-backdrop and .modal.agc-modal styled the MODAL. Agent Customizations\n   * is a window now (#panel=agent-custom) and has neither a backdrop nor a\n   * card: PanelTitleBar draws the frame. The rules are removed rather than\n   * left dead, so nothing can render the old card again.\n   */\n"],
];
console.log("lewat");
