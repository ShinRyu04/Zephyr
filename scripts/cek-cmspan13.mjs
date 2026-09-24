// cek-cmspan13.mjs — what does CodeMirror actually render for syntax colours?
//
// verify13 V1 counts distinct colours of `.cm-line span` and gets 2 for every
// theme. Either the spans are gone (CM6 renders tokens differently now) or the
// sample file is not the active document.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const cari = (sl) => document.querySelector(sl);
  const cariAll = (sl) => [...document.querySelectorAll(sl)];

  // Buka file contoh yang sama dengan verify13.
  const dir = 'C:/Users/home/AppData/Local/Temp';
  const file = dir + '/zephyr-cek-cm/contoh.ts';
  try {
    await window.__ZEPHYR_WS__.setTrust(dir + '/zephyr-cek-cm', true);
  } catch {}
  await tunggu(300);

  const info = {
    tabAda: St.getState().tabs.length,
    cmAda: !!cari('.cm-editor'),
    cmLineAda: cariAll('.cm-line').length,
    spanDiLine: cariAll('.cm-line span').length,
    spanTotal: cariAll('.cm-editor span').length,
    kelasContoh: [...new Set(cariAll('.cm-editor span').map(s => s.className))].slice(0, 12),
    warnaContoh: [...new Set(cariAll('.cm-editor span').map(s => getComputedStyle(s).color))].slice(0, 10),
  };
  return JSON.stringify(info);
`,
  90000,
);
console.log(r);
await cdp.close();
