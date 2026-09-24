// cek-efek13.mjs — does the language effect run at all?
//
// With the editor visible and 5 lines of TypeScript rendered, there are still
// zero syntax spans. The component reconfigures a compartment from an async
// loader; this appends the same extension straight onto the live view to see
// whether highlighting appears when the extension is definitely present.

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
  await tunggu(500);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2200);

  const view = window.__ZEPHYR_CM__();
  if (!view) return JSON.stringify({ viewAda: false });

  const hitung = () => {
    const cm = document.querySelector('.cm-content');
    if (!cm) return { sintaks: 0, warna: [] };
    const sp = [...cm.querySelectorAll('span')].filter(s => !/cm-zbr/.test(s.className));
    return { sintaks: sp.length, warna: [...new Set(sp.map(s => getComputedStyle(s).color))] };
  };
  const sebelum = hitung();

  // Pasang bahasa langsung ke state view, bypass compartment komponen.
  let pasang = null;
  try {
    const langMod = await import('/src/lib/lang.ts');
    const rr = await langMod.extensiUntukFile(dir + '/contoh.ts');
    const { StateEffect } = await import('/node_modules/@codemirror/state/dist/index.js');
    view.dispatch({ effects: StateEffect.appendConfig.of(rr.ext) });
    await tunggu(900);
    pasang = { langId: rr.langId, ext: rr.ext.length };
  } catch (e) {
    pasang = { err: String(e).slice(0, 150) };
  }
  const sesudah = hitung();

  return JSON.stringify({ viewAda: true, sebelum, pasang, sesudah });
`,
  120000,
);
console.log(r);
await cdp.close();
