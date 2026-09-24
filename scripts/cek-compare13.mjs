// cek-compare13.mjs — compare state before and after the reconfigure.
//
// The effect dispatches a reconfigure into the right view, yet the state still
// has no language field. Capture the state object identity and the effect list
// around the dispatch to see whether the transaction actually lands.

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
    const lang = await import('/src/lib/lang.ts');
    const rr = await lang.extensiUntukFile(dir + '/contoh.ts');
    out.langId = rr.langId;
    out.extJumlah = rr.ext.length;
    out.extTipe = rr.ext.map(e => e?.constructor?.name ?? typeof e);

    // Pasang bahasa LANGSUNG sebagai extension baru (bukan lewat compartment),
    // pakai StateEffect.reconfigure pada seluruh state? Tidak bisa.
    // Yang bisa: appendConfig dengan LanguageSupport yang sudah kita punya.
    const { StateEffect } = await import('/node_modules/.vite/deps/@codemirror_state.js');
    const m = await import('/node_modules/.vite/deps/@codemirror_language.js');

    out.sebelumTree = m.syntaxTree(view.state).length;
    // appendConfig menambah extension ke konfigurasi.
    view.dispatch({ effects: StateEffect.appendConfig.of(rr.ext) });
    await tunggu(700);
    out.sesudahAppend = m.syntaxTree(view.state).length;

    // Paksa parse.
    const t = m.ensureSyntaxTree(view.state, view.state.doc.length, 3000);
    out.setelahEnsure = t ? t.length : null;
    out.top = t ? t.topNode.type.name : null;
  } catch (e) {
    out.err = String(e).slice(0, 200);
  }
  return JSON.stringify(out);
`,
  120000,
);
console.log(r);
await cdp.close();
