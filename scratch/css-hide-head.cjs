const fs = require("fs");
const P = "src/styles/agents-window.css";
let t = fs.readFileSync(P, "utf8");

const blok = [
"",
"/* == Starting screen: NO chat header ====================================",
" *",
" * The header row (\"New chat\" + its caret + the action icons) and the hairline",
" * under it belong to a CONVERSATION: they name the chat you are in and offer",
" * what you can do to it. On the reference's starting screen there is no",
" * conversation yet, so there is no such row - the canvas opens straight into",
" * the heading.",
" *",
" * Measured on 1.1.png: the first thing in the centre column is the heading at",
" * y 287. No header, no divider.",
" */",
".ag-center .ai-panel.is-kosong .ai-head {",
"  display: none;",
"}",
"",
"/* The tab strip (Agent / Claude Code / Codex) is a different thing and stays:",
"   it chooses which surface this column shows, which is still a real choice",
"   before a conversation exists. */",
""
].join("\n");

if (!t.includes("Starting screen: NO chat header")) {
  fs.writeFileSync(P, t.replace(/\s*$/, "\n") + blok, "utf8");
  console.log("header disembunyikan saat kosong");
} else console.log("sudah ada");
