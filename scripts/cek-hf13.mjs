// cek-hf13.mjs — call highlightingFor directly on the live editor state.
//
// treeHighlighter turns each syntax tag into a CSS class through
// highlightingFor(state, tags). Calling it on the real state shows whether the
// highlighter is reachable at all, which separates "no highlighter" from "no
// decorations".

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';

  St.getState().setSettingsOpen(false);
  await tunggu(600);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(700);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(3000);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  const out = {};
  try {
    // Modul yang SAMA dengan yang dipakai editor: ambil lewat deps vite yang
    // sudah di-load halaman (bukan import baru).
    const m = await import('/node_modules/.vite/deps/@codemirror_language.js');
    const { tags } = await import('/node_modules/.vite/deps/@lezer_highlight.js');

    const st = view.state;
    out.adaHighlightingFor = typeof m.highlightingFor;
    // highlightingFor(state, tags, scope)
    const kelasKeyword = m.highlightingFor(st, [tags.keyword]);
    const kelasString = m.highlightingFor(st, [tags.string]);
    const kelasComment = m.highlightingFor(st, [tags.lineComment]);
    out.kelasKeyword = kelasKeyword;
    out.kelasString = kelasString;
    out.kelasComment = kelasComment;

    // Apakah tree ada?
    const tree = m.syntaxTree(st);
    out.treePanjang = tree.length;
    out.treeTop = tree.topNode.type.name;
  } catch (e) {
    out.err = String(e).slice(0, 200);
  }
  return JSON.stringify(out);
`,
  120000,
);
console.log(r);
await cdp.close();
