// cek-manual13.mjs — reconfigure the language compartment from inside the
// component's own view, using the component's own compartment instance.
//
// All external attempts to append the language extension produced no syntax
// tree. This drives the same compartment the component uses, on the same view,
// and then reads the tree back.

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
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2500);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  // Muat extension bahasa lewat modul app (bukan import CDP terpisah), lalu
  // pasang lewat StateEffect.appendConfig pada view yang sama.
  const hasil = {};
  try {
    const langMod = await import('/src/lib/lang.ts');
    const rr = await langMod.extensiUntukFile(dir + '/contoh.ts');
    hasil.langId = rr.langId;
    hasil.ext = rr.ext.length;
    // appendConfig TIDAK bisa dipakai untuk language? coba compartment baru.
    const { Compartment } = await import('/node_modules/@codemirror/state/dist/index.js');
    const comp = new Compartment();
    // Tambahkan compartment kosong dulu lewat appendConfig, lalu isi.
    const { StateEffect } = await import('/node_modules/@codemirror/state/dist/index.js');
    view.dispatch({ effects: StateEffect.appendConfig.of(comp.of([])) });
    await tunggu(300);
    view.dispatch({ effects: comp.reconfigure(rr.ext) });
    await tunggu(800);

    const langMod2 = await import('/node_modules/@codemirror/language/dist/index.js');
    const t = langMod2.syntaxTree(view.state);
    hasil.treePanjang = t.length;
    hasil.treeTop = t.topNode.type.name;
  } catch (e) {
    hasil.err = String(e).slice(0, 200);
  }

  const cm = document.querySelector('.cm-content');
  const sp = cm ? [...cm.querySelectorAll('span')].filter(s => !/cm-zbr/.test(s.className)) : [];
  return JSON.stringify({ viewAda: true, hasil, spanSintaks: sp.length, warna: [...new Set(sp.map(s => getComputedStyle(s).color))] });
`,
  120000,
);
console.log(r);
await cdp.close();
