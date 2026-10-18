const fs = require("fs");
const asli = fs.readFileSync("src/styles/chat-settings.css", "utf8");
const E = asli.includes("\r\n") ? "\r\n" : "\n";
const lines = asli.split(/\r?\n/);
const iAwal = lines.findIndex((l) => l.includes("The overlay home.")) - 1;
const iAkhir = lines.findIndex((l) => l.includes("Scope tabs (User / Workspace)")) - 1;
const baru = [
  "/* \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
  "   The WINDOW home.",
  "",
  "   This page used to have three homes: an overlay over the chat (`.cset-pop`, with",
  "   a scrim, a drag offset and its own maximize button), a real editor tab, and",
  "   now its own OS window (`#panel=chat-settings`). The overlay is GONE - it was",
  "   the one that could be maximized while keeping a leftover drag offset, which is",
  "   what painted the left rail over the content. Its rules were deleted rather",
  "   than left unused, so nothing can render a floating copy again.",
  "",
  "   What remains below styles the page itself, which every home shares.",
  "   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
  "",
];
const hasil = [...lines.slice(0, iAwal), ...baru, ...lines.slice(iAkhir)];
fs.writeFileSync("src/styles/chat-settings.css", hasil.join(E));
console.log("dibuang baris", iAwal + 1, "s/d", iAkhir, "=", iAkhir - iAwal, "baris");
