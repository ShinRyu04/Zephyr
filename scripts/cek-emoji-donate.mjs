// cek-emoji-donate.mjs — is the donate button an emoji or still an SVG?
//
// The screenshot still shows a monochrome outline cup, but the source now
// renders the coffee emoji in a span. Read the button's innerHTML so the
// difference is unambiguous.

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

  const b = document.querySelector('[data-testid="about-donate"]');
  if (!b) return JSON.stringify({ ada: false });

  const span = b.querySelector('.about-donate-emoji');
  return JSON.stringify({
    ada: true,
    html: b.innerHTML.slice(0, 220),
    adaSvg: !!b.querySelector('svg'),
    adaSpanEmoji: !!span,
    teksEmoji: span?.textContent ?? null,
    warnaEmoji: span ? getComputedStyle(span).color : null,
    fontEmoji: span ? getComputedStyle(span).fontFamily : null,
    warnaTombol: getComputedStyle(b).color,
  });
`,
  90000,
);
console.log(r);
await cdp.close();
