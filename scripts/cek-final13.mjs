// cek-final13.mjs — count every span and its colour, no filtering.
//
// Every earlier probe filtered spans by "not cm-zbr", which threw away the
// very spans that carry the syntax colours: CodeMirror merges the highlight
// class and the bracket class onto the same element. Count them all.

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
  await tunggu(3200);

  const cm = document.querySelector('.cm-content');
  const spans = cm ? [...cm.querySelectorAll('span')] : [];
  const rinci = spans.map(s => ({
    teks: s.textContent,
    kelas: s.className,
    warna: getComputedStyle(s).color,
  }));
  return JSON.stringify({
    jumlahSpan: spans.length,
    warnaUnik: [...new Set(spans.map(s => getComputedStyle(s).color))],
    rinci,
  });
`,
  120000,
);
console.log(r);
await cdp.close();
