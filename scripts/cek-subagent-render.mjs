/*
 * Render check for the subagents timeline + markdown summary.
 *
 * Seeds a three-agent batch and a markdown report into the store, then reads
 * back the DOM: row numbers, status, the steps/duration column, the segmented
 * progress blocks, and whether the summary rendered as markdown (headings,
 * list items, rules) instead of printing its own source.
 *
 * The store is reached through window.__ZEPHYR_SUB__.store, not a module
 * import: importing '/src/lib/subagentStore.ts' from the console gets a SECOND
 * copy of the module (Vite serves it under a different URL than the one the app
 * loaded), and setting state on that copy changes nothing the UI renders.
 */
import { Cdp } from './lib-cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const BACK = 'String.fromCharCode(96)';
const q1 = (p) => `${BACK} + "${p}" + ${BACK}`;

const body = `
  const p = await import("/src/lib/panelStore.ts");
  const t = await import("/src/lib/terminalStore.ts");
  const SUB = window.__ZEPHYR_SUB__.store;
  t.useTerminal.getState().setVisible(true);
  p.usePanel.getState().focusTab("subagents");
  await wait(600);

  const now = Date.now();
  SUB.setState({
    sibuk: false,
    agents: [
      { id: "a1", nama: "Comet", peran: "cari", tugas: "Find usages of parseConfig", status: "selesai", mulai: now - 8200, selesai: now - 2400, langkah: [{ kind: "tool", nama: "read_file", args: JSON.stringify({path: "src/lib/config.ts"}), ok: true }], hasil: "parseConfig dipakai di 4 berkas", error: null, kedalaman: 0, verdict: "terbukti" },
      { id: "a2", nama: "Odyssey", peran: "tulis", tugas: "Fix the off-by-one in the pager", status: "jalan", mulai: now - 4100, selesai: null, langkah: [{ kind: "tool", nama: "edit_file", args: JSON.stringify({path: "src/lib/pager.ts"}), ok: true }], hasil: "", error: null, kedalaman: 0 },
      { id: "a3", nama: "Nova", peran: "uji", tugas: "Run the suite and report failures", status: "menunggu", mulai: now, selesai: null, langkah: [], hasil: "", error: null, kedalaman: 0 }
    ],
    ringkasan: [
      "## Comet - done", "", "Task: Find usages of parseConfig", "",
      "parseConfig is called from **4 files**:", "",
      "- " + ${q1('src/lib/config.ts')} + " (definition)",
      "- " + ${q1('src/lib/store.ts')},
      "- " + ${q1('src/main.tsx')},
      "- " + ${q1('src/App.tsx')}, "",
      "---", "", "## Odyssey - running", "",
      "Editing " + ${q1('src/lib/pager.ts')} + " to fix the off-by-one.",
    ].join(String.fromCharCode(10)),
  });
  await wait(900);

  const out = {};
  out.baris = qa(".sub-baris").map((b) => ({
    nomor: b.getAttribute("data-nomor"),
    status: b.getAttribute("data-status"),
    chip: (b.querySelector(".sub-agent-chip") || {}).textContent,
    tugas: ((b.querySelector(".sub-tugas") || {}).textContent || "").slice(0, 26),
    metrik: ((b.querySelector(".sub-waktu") || {}).textContent || "").trim(),
    tinggi: Math.round(b.getBoundingClientRect().height),
  }));
  out.segmen = qa(".sub-segmen-blok").length;
  out.tabelHead = !!q(".sub-tabel-head");
  out.terlihat = qa(".sub-baris").filter((x) => {
    const r = x.getBoundingClientRect();
    return r.top > 0 && r.bottom < innerHeight;
  }).length;

  const sum = q(".sub-ringkas");
  out.summaryAda = !!sum;
  if (sum) {
    sum.open = true;
    await wait(400);
    const isi = q(".sub-ringkas-isi");
    out.md = {
      headings: sum.querySelectorAll("h1,h2,h3").length,
      listItems: sum.querySelectorAll("li").length,
      rules: sum.querySelectorAll("hr").length,
      inlineCode: sum.querySelectorAll(".sub-ringkas-inline").length,
      preBlocks: sum.querySelectorAll("pre").length,
      sourceVisible: /(^|\\n)##\\s/.test(isi ? isi.textContent : ""),
      fontProse: isi ? getComputedStyle(isi).fontFamily.split(",")[0] : "-",
      maxWidth: isi ? getComputedStyle(isi).maxWidth : "-",
    };
  }
  return out;
`;

const r = await cdp.runAsync(body, 60000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
