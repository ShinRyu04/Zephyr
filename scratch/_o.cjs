const fs = require("fs");
for (const f of ["src/lib/agentCustomStore.ts", "src/lib/aiModelsStore.ts", "src/lib/chatSettingsStore.ts"]) {
  const s = fs.readFileSync(f, "utf8").split(/\r?\n/);
  const out = [];
  s.forEach((l, i) => { if (/open:|buka:|setBuka|tutup:|setOpen|export const use/.test(l)) out.push((i + 1) + ": " + l.trim().slice(0, 100)); });
  console.log("=== " + f + " ===");
  console.log(out.slice(0, 12).join("\n"));
}
