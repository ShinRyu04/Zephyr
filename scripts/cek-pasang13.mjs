// cek-pasang13.mjs — force the language extension onto the live view and see
// whether syntax spans appear.
//
// extensiUntukFile('x.ts') returns a LanguageSupport, the tab reports
// typescript, yet the view renders only cm-zbr (rainbow bracket) spans. This
// appends the extension straight onto the live view state, bypassing the
// component's compartment, to separate "loader is broken" from "reconfigure
// never lands".

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  try { await window.__ZEPHYR_WS__.setTrust(dir, true); } catch {}
  await tunggu(250);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(600);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2500);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  const hitung = () => {
    const cm = document.querySelector('.cm-content');
    if (!cm) return { span: 0, warna: [] };
    const sp = [...cm.querySelectorAll('span')];
    return {
      span: sp.length,
      warna: [...new Set(sp.map(s => getComputedStyle(s).color))].slice(0, 8),
      kelas: [...new Set(sp.map(s => s.className))].slice(0, 8),
    };
  };
  const sebelum = hitung();

  // 1. Pasang bahasa langsung ke state view (bypass compartment komponen).
  let hasilPasang = null;
  try {
    const langMod = await import('/src/lib/lang.ts');
    const rr = await langMod.extensiUntukFile(dir + '/contoh.ts');
    const { StateEffect } = await import('/node_modules/@codemirror/state/dist/index.js');
    view.dispatch({ effects: StateEffect.appendConfig.of(rr.ext) });
    await tunggu(800);
    hasilPasang = { langId: rr.langId, jumlahExt: rr.ext.length };
  } catch (e) {
    hasilPasang = { err: String(e).slice(0, 160) };
  }
  const sesudah = hitung();

  return JSON.stringify({ viewAda: true, sebelum, hasilPasang, sesudah });
`,
  120000,
);
console.log(r);
await cdp.close();
