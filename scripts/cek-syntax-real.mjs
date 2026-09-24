// cek-syntax-real.mjs — open a real .ts file and count coloured spans.
//
// Every earlier probe ran with zero tabs open, so the editor was empty and the
// span count meant nothing. This opens the file first, waits for the language
// extension to load, then measures.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const cariAll = (sl) => [...document.querySelectorAll(sl)];

  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';
  try { await window.__ZEPHYR_WS__.setTrust(dir, true); } catch {}
  await tunggu(300);

  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(2000);

  const tabs = St.getState().tabs;
  const view = window.__ZEPHYR_CM__();
  const spans = cariAll('.cm-line span');
  const warna = [...new Set(spans.map(s => getComputedStyle(s).color))];
  return JSON.stringify({
    jumlahTab: tabs.length,
    tabNama: tabs.map(t => t.name),
    tabLang: tabs[0]?.lang,
    viewAda: !!view,
    panjangDoc: view ? view.state.doc.length : 0,
    baris: cariAll('.cm-line').length,
    spanWarna: spans.length,
    warnaUnik: warna.length,
    warnaContoh: warna.slice(0, 8),
    kelasContoh: [...new Set(spans.map(s => s.className))].slice(0, 8),
  });
`,
  120000,
);
console.log(r);
await cdp.close();
