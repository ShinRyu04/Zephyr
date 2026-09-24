// cek-bukafile13.mjs — why does openPath stop producing a view?
//
// cek-tegas13 opened the same file successfully and got 4 spans. A later run
// reports viewAda false for four seconds, so the open itself is failing now.
// Print the store state and any error around the call.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  const file = dir + '/contoh.ts';

  const awal = {
    workspace: St.getState().workspace,
    tabs: St.getState().tabs.length,
    errors: window.__ZEPHYR_ERRORS__.slice(0, 3).map(e => String(e).slice(0, 120)),
  };

  let err = null;
  try {
    await St.getState().openPath(file);
  } catch (e) {
    err = String(e).slice(0, 200);
  }
  await tunggu(2000);

  const st = St.getState();
  return JSON.stringify({
    awal,
    err,
    tabsSekarang: st.tabs.map(t => ({ name: t.name, lang: t.lang, path: t.path })),
    aktif: st.activeTabId,
    viewAda: !!window.__ZEPHYR_CM__(),
    cmDom: !!document.querySelector('.cm-editor'),
    cmContent: !!document.querySelector('.cm-content'),
  });
`,
  120000,
);
console.log(r);
await cdp.close();
