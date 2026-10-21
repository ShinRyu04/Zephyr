const fs = require("fs");
const P = "src/styles/agents-window.css";
let t = fs.readFileSync(P, "utf8");
const lama = `  --ag-frame: var(--bg);
  --ag-panel: var(--surface);
  --ag-panel-border: var(--border);
  --ag-hover: var(--surface-2);
  --ag-aktif: var(--surface-3, var(--surface-2));
  --ag-teks2: var(--text-muted);
  --ag-teks-kuat: var(--text);
  --ag-mb-ikon: var(--text-muted);
  --ag-ikon-latar: var(--surface-2);
  --ag-sash: var(--border-strong, var(--border));`;
const baru = `  /*
   * MEASURED values, not aliases.
   *
   * These used to point at the global theme (--bg, --surface), which collapsed
   * every layer to the same colour: the frame, the sidebar and the canvas all
   * rendered #0d1117. Measured on the reference at three points, it uses three
   * DISTINCT layers:
   *
   *   #303030  the sidebar's header strip
   *   #262626  the frame and the sidebar body
   *   #171717  the centre canvas - DARKER than the frame, not lighter
   *
   * That inversion is the whole look. A single flat colour cannot imitate it
   * no matter how the buttons are arranged, which is why the earlier passes
   * kept landing on "close but not it".
   */
  --ag-header: #303030;
  --ag-frame: #262626;
  --ag-panel: #171717;
  --ag-panel-border: rgba(229, 229, 229, 0.1);
  --ag-hover: rgba(229, 229, 229, 0.07);
  --ag-aktif: rgba(229, 229, 229, 0.12);
  --ag-teks2: #737373;
  --ag-teks-kuat: #e5e5e5;
  --ag-mb-ikon: #a3a3a3;
  --ag-ikon-latar: rgba(229, 229, 229, 0.08);
  --ag-sash: rgba(229, 229, 229, 0.08);`;
if (!t.includes(lama)) { console.log("anchor token tidak ketemu"); process.exit(1); }
t = t.replace(lama, baru);
fs.writeFileSync(P, t, "utf8");
console.log("token diperbarui");
