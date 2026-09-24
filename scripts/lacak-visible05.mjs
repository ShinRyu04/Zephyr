// lacak-visible05.mjs — who turns the terminal panel off?
//
// addPane sets visible:true, yet by the time verify05 reads the DOM the panel
// is hidden again. Patch setVisible in the page to log every transition with a
// stack trace, then run the same open sequence and print the trail.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const tt = window.__ZEPHYR_TERM__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));

  // Bersihkan dulu seperti verify05.
  for (const x of tt.getState().terminalTabs.slice()) await tt.getState().closeTab(x.id);
  await tunggu(600);
  const jejak = [];
  const asli = tt.getState().setVisible;
  window.__ZEPHYR_TERM__.setState({
    setVisible: (v) => {
      jejak.push({ ke: v, dari: new Error().stack.split('\\n').slice(2, 5).join(' | ') });
      return asli(v);
    },
  });

  const id = await tt.getState().addPane('shell');
  await tunggu(2500);
  const sesudahAdd = {
    visible: tt.getState().visible,
    adaGrid: !!document.querySelector('.pane-grid'),
    adaXterm: !!document.querySelector('.xterm'),
  };
  return JSON.stringify({ id, sesudahAdd, jejak });
`,
  90000,
);
console.log(r);
await cdp.close();
