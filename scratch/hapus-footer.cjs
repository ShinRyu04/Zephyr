const fs = require("fs");
const P = "src/components/agents/AgentsSessions.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = t.includes("\r\n") ? "\r\n" : "\n";

// 1) hapus seluruh blok footer (dari komentar penanda sampai penutupnya)
const awal = t.indexOf("      {/* ── Footer: 48px, account + the `…` menu");
const akhir = t.indexOf("      </div>" + NL + "    </div>" + NL + "  );" + NL + "}", awal);
if (awal < 0 || akhir < 0) { console.log("anchor footer tidak ketemu", awal, akhir); process.exit(1); }
const catatan = [
"      {/*",
"       * NO footer.",
"       *",
"       * This was a 48px strip holding the workspace avatar, its folder name",
"       * and a `...` menu that opened Agent Customizations. Both were",
"       * duplicates of surfaces that already exist: the folder name is in the",
"       * window title and the session list's own header, and Customizations is",
"       * reachable from Settings and from the composer's agent menu.",
"       *",
"       * Removed on request while the reference layout is being matched - the",
"       * real account footer is still to come from that reference, so keeping",
"       * a stand-in here would have been a control that only LOOKS like the",
"       * final one.",
"       */}",
""
].join(NL);
t = t.slice(0, awal) + catatan + t.slice(akhir);
fs.writeFileSync(P, t, "utf8");
console.log("footer dihapus");
