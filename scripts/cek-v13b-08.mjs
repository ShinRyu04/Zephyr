// cek-v13b-08.mjs — print every V13 value WITH its type.
//
// The V13 failure message shows baris/versi/zoom values that all satisfy the
// check, so the failing condition is almost certainly a type mismatch (a
// missing provider makes keySisa undefined, and undefined === false is false).

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const Xx = window.__ZEPHYR_SET__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const cari = (sl) => document.querySelector(sl);
  const cariAll = (sl) => [...document.querySelectorAll(sl)];

  St.getState().setSettingsOpen(true);
  await tunggu(700);
  Xx.ui.getState().setSection('about');
  await tunggu(1400);

  const baris = cariAll('[data-testid="about-table"] tr').length;
  const versi = cariAll('[data-testid="about-table"] .about-v code')[0]?.textContent ?? '';
  const dataDir = St.getState().appInfo?.dataDir ?? '';

  const rootFont = () => getComputedStyle(document.documentElement).fontSize;
  const zoomAwal = rootFont();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true, cancelable: true }));
  await tunggu(700);
  const zoomNaik = rootFont();
  const diskZoom = (await Xx.settingsFromDisk()).general.zoom;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true, cancelable: true }));
  await tunggu(700);
  const zoomBalik = rootFont();

  const pub = await Xx.publicModels();
  const gem = pub.find(x => x.provider === 'gemini');
  return JSON.stringify({
    baris, tipeBaris: typeof baris,
    versi, tipeVersi: typeof versi,
    dataDir: dataDir.slice(0, 40),
    zoomAwal, zoomNaik, zoomBalik, diskZoom, tipeDiskZoom: typeof diskZoom,
    errors: window.__ZEPHYR_ERRORS__.length,
    geminiAda: !!gem,
    keySisa: gem?.hasKey,
    tipeKeySisa: typeof (gem?.hasKey),
    providerAda: pub.map(x => x.provider),
  });
`,
  90000,
);
console.log(r);
await cdp.close();
