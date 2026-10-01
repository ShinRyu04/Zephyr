// cek-panel05.mjs — is the terminal panel on screen at all?
//
// A pane can exist in the store while its panel is hidden, and then nothing
// renders: no .xterm, no .xterm-rows, no spans. verify05 assumes the panel is
// already open, so V1..V5 all fail on an invisible pane.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const tt = window.__ZEPHYR_TERM__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const st0 = tt.getState();
  const sebelum = {
    visible: st0.visible,
    panelTab: window.__ZEPHYR_PANEL__?.getState?.().activeTab ?? null,
    panelOpen: window.__ZEPHYR_PANEL__?.getState?.().open ?? null,
    panes: st0.allPanes().length,
    adaGrid: !!document.querySelector('.pane-grid'),
    adaXterm: !!document.querySelector('.xterm'),
    adaEmpty: !!document.querySelector('.pane-empty'),
  };
  // Buka lewat jalur UI yang sama dengan tombol panel.
  st0.setVisible(true);
  await tunggu(1500);
  const sesudah = {
    visible: tt.getState().visible,
    adaGrid: !!document.querySelector('.pane-grid'),
    adaXterm: !!document.querySelector('.xterm'),
    adaRows: !!document.querySelector('.xterm-rows'),
    span: document.querySelectorAll('.xterm-rows span').length,
    paneBody: document.querySelectorAll('[data-pane-body]').length,
  };
  return JSON.stringify({ sebelum, sesudah });
`,
  90000,
);
console.log(r);
await cdp.close();
