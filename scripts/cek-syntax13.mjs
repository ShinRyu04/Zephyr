// cek-syntax13.mjs — how many syntax tokens actually differ per theme?
//
// verify13 V1 wants >=3 distinct syntax colours per theme and reports 2 for
// zephyr-dark. Either the theme really only sets two, or the harness reads
// the wrong tokens.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const Xx = window.__ZEPHYR_SET__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  const TOKEN_SYNTAX = [
    '--syn-keyword', '--syn-string', '--syn-number', '--syn-comment',
    '--syn-function', '--syn-type', '--syn-variable', '--syn-operator',
    '--syn-constant', '--syn-tag', '--syn-attr', '--syn-punct',
  ];

  const hasil = [];
  for (const t of ['zephyr-dark', 'nord', 'tokyo-night']) {
    Xx.ui.getState().setTheme?.(t);
    await tunggu(500);
    const cs = getComputedStyle(document.documentElement);
    const warna = {};
    for (const k of TOKEN_SYNTAX) {
      const v = cs.getPropertyValue(k).trim();
      if (v) warna[k] = v;
    }
    hasil.push({
      tema: t,
      jumlahToken: Object.keys(warna).length,
      unik: new Set(Object.values(warna)).size,
      contoh: Object.entries(warna).slice(0, 6),
    });
  }
  // kembali ke default
  Xx.ui.getState().setTheme?.('zephyr-dark');
  return JSON.stringify({ hasil, adaSetTheme: typeof Xx.ui.getState().setTheme });
`,
  90000,
);
console.log(r);
await cdp.close();
