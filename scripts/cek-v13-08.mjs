// cek-v13-08.mjs — print every V13 value so the failing condition is visible.
//
// The V13 failure message prints only a few of the fields, and all of those
// look right, so the failing one has to be read directly.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const S = window.__ZEPHYR__;
  const X = window.__ZEPHYR_SET__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];

  S.getState().setSettingsOpen(true);
  await tunggu(600);
  X.ui.getState().setSection('about');
  await tunggu(1500);

  const baris = qa('[data-testid="about-row"], .about-row, .set-row').length;
  const teks = q('.set-body')?.textContent ?? '';
  const versi = (teks.match(/(\\d+\\.\\d+\\.\\d+)/) ?? [])[1] ?? null;

  // Ukur zoom seperti harness: root font-size sebelum & sesudah.
  const zoomAwal = getComputedStyle(document.documentElement).fontSize;
  return JSON.stringify({
    baris,
    versi,
    zoomAwal,
    settingsOpen: S.getState().settingsOpen,
    adaAbout: !!q('[data-testid="set-section-about"]') || teks.length > 0,
    teksPotong: teks.slice(0, 120),
  });
`,
  90000,
);
console.log(r);
await cdp.close();
