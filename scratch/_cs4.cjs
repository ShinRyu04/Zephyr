const fs = require("fs");
const asli = fs.readFileSync("src/styles/chat-settings.css", "utf8");
const E = asli.includes("\r\n") ? "\r\n" : "\n";
const lines = asli.split(/\r?\n/);
// buang 431..501 (1-based) => index 430..500
const ganti = [
  "/* The section column and the content measure.",
  "",
  "   These were scoped to `.cset-pop` when the page had a floating home, which",
  "   gave it 196px of rail and a 980px content measure inside a 1280px card.",
  "   There is no card any more: the window sizes itself, so the rules apply to",
  "   the page directly and the same numbers hold at the same widths.",
  "   The `is-besar` variants are gone with the maximize button that set them. */",
  ".cset-nav {",
  "  flex: 0 0 196px;",
  "  padding: 14px 10px;",
  "}",
  "",
  ".cset-nav-item {",
  "  padding: 7px 11px;",
  "  font-size: 12.5px;",
  "}",
  "",
  ".cset-content {",
  "  padding: 18px 26px 36px;",
  "}",
  "",
  "/* The content column was capped by `.set-section { max-width: 780px }` from the",
  "   main Settings page, which leaves half of a wide window unused and pushes the",
  "   controls to the far left. Widened here only - the Settings page keeps its",
  "   measure, because there the column is genuinely narrower. */",
  ".cset-content .set-section {",
  "  max-width: 980px;",
  "}",
];
const hasil = [...lines.slice(0, 430), ...ganti, ...lines.slice(501)];
fs.writeFileSync("src/styles/chat-settings.css", hasil.join(E));
console.log("ok");
