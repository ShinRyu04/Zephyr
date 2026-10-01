// cek-ensure13.mjs — is the parser even running?
//
// highlightingFor resolves classes correctly, so the only missing piece is the
// syntax tree: syntaxTree() returns empty. A parser that has not run yet, or a
// parser that errors out immediately, both look like this.

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
    const m = await import('/node_modules/.vite/deps/@codemirror_language.js');
    const st = view.state;

    out.sebelum = m.syntaxTree(st).length;

    // Paksa parser jalan sampai 200 char, timeout 2 detik.
    const t = m.ensureSyntaxTree(st, 200, 2000);
    out.setelahEnsure = t ? t.length : null;
    out.topSetelah = t ? t.topNode.type.name : null;

    // Cek bahasa terpasang lewat facet.
    out.facetCount = st.facet(m.languageData).length;
  } catch (e) {
    out.err = String(e).slice(0, 200);
  }
  return JSON.stringify(out);
`,
  120000,
);
console.log(r);
await cdp.close();
