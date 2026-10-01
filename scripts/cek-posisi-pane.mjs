// cek-posisi-pane.mjs — measure the pane rectangle over time after the agent
// opens a page.
//
// The tool call itself succeeds and the pane appears in the store, but an
// immediate measurement can read [0,0,0,0] because React has not laid the
// element out yet. This samples the rectangle for a few seconds so a real
// positioning bug can be told apart from a timing artifact.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const r = await cdp.runAsync(`
  const _term = window.__ZEPHYR_TERM__;
  for (const t of _term.getState().terminalTabs.slice()) await _term.getState().closeTab(t.id);
  await new Promise(r => setTimeout(r, 900));
  _term.getState().setVisible(true);
  await new Promise(r => setTimeout(r, 400));

  const t = window.__ZEPHYR_TOOLS__ ?? [];
  const tool = t.find(x => x.spec.name === 'browser_open');
  const hasil = await tool.run({ url: 'https://example.com' });

  const jejak = [];
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    const bp = _term.getState().allPanes().find(p => p.kind === 'browser');
    const el = bp ? document.querySelector('.pane-body:has([data-pane-body="' + bp.id + '"])') : null;
    const rr = el?.getBoundingClientRect();
    jejak.push({
      t: (i + 1) * 500,
      paneAda: !!bp,
      rect: rr ? [Math.round(rr.left), Math.round(rr.top), Math.round(rr.width), Math.round(rr.height)] : null,
    });
  }

  const bp = _term.getState().allPanes().find(p => p.kind === 'browser');
  return JSON.stringify({
    hasil: String(hasil).slice(0, 70),
    paneId: bp?.id ?? null,
    urlStore: bp?.url ?? null,
    jejak,
  });
`, 90000);

console.log(r);
await cdp.close();
