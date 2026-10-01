// cek-timing13.mjs — how long until syntax spans appear?
//
// verify13 opens the sample file, waits 700ms, then counts colours. The
// language extension is a dynamic import that resolves later, so the count is
// taken before highlighting exists. Measure the real delay.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const hitung = () => {
    const cm = document.querySelector('.cm-content');
    if (!cm) return { span: 0, warna: 0 };
    const sp = [...cm.querySelectorAll('span')].filter(s => /cm-zbr/.test(s.className) === false);
    return { span: sp.length, warna: new Set(sp.map(s => getComputedStyle(s).color)).size };
  };

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  try { await window.__ZEPHYR_WS__.setTrust(dir, true); } catch {}
  await tunggu(250);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(600);

  const jejak = [];
  await St.getState().openPath(dir + '/contoh.ts');
  for (const t of [200, 500, 700, 1000, 1500, 2500, 4000]) {
    await tunggu(t === 200 ? 200 : t - jejak[jejak.length - 1].t);
    const h = hitung();
    jejak.push({ t, span: h.span, warna: h.warna, viewAda: !!window.__ZEPHYR_CM__() });
  }
  return JSON.stringify({ jejak });
`,
  120000,
);
console.log(r);
await cdp.close();
