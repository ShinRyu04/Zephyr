const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
for (const k of ["setDraft:","agentBusy:","drafts:","draftOf:"]) {
  const i = t.indexOf("\n  " + k);
  if (i > 0) { console.log("=== " + k + " ==="); console.log(t.slice(i, i + 220)); }
}
