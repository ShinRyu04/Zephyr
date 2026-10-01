// cek-logo-tiga.mjs — colour check for all three brand buttons.
//
// GitHub and WhatsApp already pass; this confirms the donate button picked up
// its warm brand colour too, and that all three read differently from each
// other.

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
      warnaTombol: getComputedStyle(b).color,
      border: getComputedStyle(b).borderTopColor,
      warnaIkon: svg ? getComputedStyle(svg).color : null,
    };
  };

  const cs = getComputedStyle(document.documentElement);
  return JSON.stringify({
    github: ambil('[data-testid="about-github"]'),
    issue: ambil('[data-testid="about-issue"]'),
    wa: ambil('[data-testid="about-wa"]'),
    donate: ambil('[data-testid="about-donate"]'),
    token: {
      wa: cs.getPropertyValue('--brand-whatsapp').trim(),
      gh: cs.getPropertyValue('--brand-github').trim(),
      donate: cs.getPropertyValue('--brand-donate').trim(),
    },
  });
`,
  90000,
);
console.log(r);
await cdp.close();
