// uji-addpane-panel.mjs — prove the panel follows a new pane.
//
// Sets the panel to a different tab (problems), creates a shell pane, and
// checks that the pane is actually rendered. Before the fix the pane existed
// in the store with no DOM at all.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const tt = window.__ZEPHYR_TERM__;
  const pp = window.__ZEPHYR_PANEL__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  for (const x of tt.getState().terminalTabs.slice()) await tt.getState().closeTab(x.id);
  await tunggu(600);

  // Panel sengaja dipindah ke tab lain: ini keadaan yang dulu bikin pane
  // tidak ter-render sama sekali.
  pp.store.getState().setActiveTab('problems');
  await tunggu(700);
  const sebelum = {
    tabPanel: pp.activeTab(),
    adaGrid: !!document.querySelector('.pane-grid'),
  };

  const id = await tt.getState().addPane('shell');
  await tunggu(2500);
  const sesudah = {
    tabPanel: pp.activeTab(),
    visible: tt.getState().visible,
    adaGrid: !!document.querySelector('.pane-grid'),
    adaXterm: !!document.querySelector('.xterm'),
    span: document.querySelectorAll('.xterm-rows span').length,
    pane: tt.getState().allPanes().length,
  };
  return JSON.stringify({ id, sebelum, sesudah });
`,
  90000,
);
console.log(r);
await cdp.close();
