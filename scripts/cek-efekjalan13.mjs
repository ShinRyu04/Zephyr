// cek-efekjalan13.mjs — is the language effect running at all?
//
// The view has no syntax tree and no languageData facet, so the language
// compartment was never filled. The component fills it from a useEffect keyed
// on the tab. Patch the loader to log every call, then open a file and see
// whether the effect fires and what it returns.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  St.getState().setSettingsOpen(false);
  await tunggu(500);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(500);

  // Pasang penghitung pada loader yang dipakai komponen.
  const jejak = [];
  try {
    const mod = await import('/src/lib/lang.ts');
    const asli = mod.extensiUntukFile;
    // Modul ESM tidak bisa ditimpa; jadi kita catat dengan memanggilnya sendiri
    // pada jalur yang sama supaya tahu berapa lama & hasilnya.
    const t0 = performance.now();
    const rr = await asli(dir + '/contoh.ts');
    jejak.push({ panggil: 'manual', ms: Math.round(performance.now() - t0),
                 langId: rr.langId, ext: rr.ext.length });
  } catch (e) {
    jejak.push({ err: String(e).slice(0, 140) });
  }

  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(3000);

  const view = window.__ZEPHYR_CM__();
  let tree = null;
  if (view) {
    try {
      const mod = await import('/node_modules/@codemirror/language/dist/index.js');
      const t = mod.syntaxTree(view.state);
      tree = { panjang: t.length, top: t.topNode.type.name };
    } catch (e) { tree = { err: String(e).slice(0, 100) }; }
  }
  return JSON.stringify({ jejak, viewAda: !!view, tree, tabLang: St.getState().tabs[0]?.lang });
`,
  120000,
);
console.log(r);
await cdp.close();
