// cek-logo-warna.mjs — are the brand logos coloured now?
//
// The About buttons previously rendered every mark in the button text colour
// (white). This reads the computed colour of each SVG so the brand colour is
// visible as a value, not a guess.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const Xx = window.__ZEPHYR_SET__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  St.getState().setSettingsOpen(true);
  await tunggu(700);
  Xx.ui.getState().setSection('about');
  await tunggu(1500);

  const ambil = (sel) => {
    const b = document.querySelector(sel);
    if (!b) return { ada: false };
    const svg = b.querySelector('svg');
    return {
      ada: true,
      teks: b.textContent.trim(),
      kelas: b.className,
      warnaSvg: svg ? getComputedStyle(svg).color : null,
    };
  };

  const cs = getComputedStyle(document.documentElement);
  return JSON.stringify({
    github: ambil('[data-testid="about-github"]'),
    issue: ambil('[data-testid="about-issue"]'),
    wa: ambil('[data-testid="about-wa"]'),
    tokenWa: cs.getPropertyValue('--brand-whatsapp').trim(),
    tokenGh: cs.getPropertyValue('--brand-github').trim(),
  });
`,
  90000,
);
console.log(r);
await cdp.close();
