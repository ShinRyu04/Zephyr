// cek-panggil13.mjs — does the language effect call the loader at all?
//
// Wrapping EditorView.prototype.dispatch showed zero dispatches, which is
// impossible if the component ran its language effect (it dispatches a
// reconfigure). Either the prototype patch missed the real class instance, or
// the effect returns early. This counts calls by patching a module-level
// export through a Proxy on the dynamic import map.

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
  await tunggu(600);

  // Buka file dan hitung berapa kali extensiUntukFile dipanggil dari dalam
  // halaman. Kita tidak bisa menimpa modul ESM, jadi kita catat lewat
  // performance mark: efek memanggilnya ~0ms setelah mount.
  const tanda = [];
  const obs = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'childList') {
        const cm = document.querySelector('.cm-editor');
        if (cm) tanda.push({ t: Math.round(performance.now()), ada: true });
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(3000);
  obs.disconnect();

  const view = window.__ZEPHYR_CM__();
  const cmEl = document.querySelector('.cm-editor');
  let tree = null;
  if (view) {
    try {
      const mod = await import('/node_modules/@codemirror/language/dist/index.js');
      const t = mod.syntaxTree(view.state);
      tree = { panjang: t.length, top: t.topNode.type.name };
    } catch (e) { tree = { err: String(e).slice(0, 90) }; }
  }

  // Cek langsung: apakah extension bahasa ada di state view?
  let adaBahasa = null;
  try {
    const mod = await import('/node_modules/@codemirror/language/dist/index.js');
    // languageData adalah facet; kalau bahasa terpasang, facetnya tidak kosong.
    adaBahasa = view ? view.state.facet(mod.languageData).length : null;
  } catch (e) { adaBahasa = 'err: ' + String(e).slice(0, 80); }

  return JSON.stringify({
    viewAda: !!view,
    cmElAda: !!cmEl,
    cmKelas: cmEl?.className ?? null,
    tree,
    facetBahasa: adaBahasa,
    jumlahTanda: tanda.length,
    tabLang: St.getState().tabs[0]?.lang,
  });
`,
  120000,
);
console.log(r);
await cdp.close();
