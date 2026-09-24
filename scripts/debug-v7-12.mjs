// debug-v7-12.mjs — check whether the browser pane really shows its error
// panel when a page cannot load.
//
// The pane is a child WebView2, so a dead host surfaces as a WebView2 load
// failure. The component renders [data-testid="bp-error"] when it sees one.
// This prints what the DOM actually contains after pointing the pane at a
// port with no listener.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const r = await cdp.runAsync(`
  const _term = window.__ZEPHYR_TERM__;
  for (const t of _term.getState().terminalTabs.slice()) await _term.getState().closeTab(t.id);
  await new Promise(r => setTimeout(r, 800));
  _term.getState().setVisible(true);
  _term.getState().newTab();
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('[data-testid="empty-split-browser"]').click();
  await new Promise(r => setTimeout(r, 2500));

  const el = document.querySelector('[data-testid="bp-url"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, 'http://127.0.0.1:1');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  el.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  const jejak = [];
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 400));
    jejak.push({
      t: (i + 1) * 400,
      error: !!document.querySelector('[data-testid="bp-error"]'),
      luar: !!document.querySelector('[data-testid="bp-open-external"]'),
      teks: (document.querySelector('[data-testid="bp-error"]')?.textContent ?? '').replace(/\\s+/g, ' ').slice(0, 90),
    });
  }

  return JSON.stringify({
    jejak,
    semuaTestId: [...document.querySelectorAll('[data-testid^="bp-"]')].map(e => e.getAttribute('data-testid')),
  });
`, 90000);

console.log(r);
await cdp.close();
