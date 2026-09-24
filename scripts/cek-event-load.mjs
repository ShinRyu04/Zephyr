// cek-event-load.mjs — listen for the browser-pane-load event directly.
//
// The error panel depends on Rust emitting that event when a navigation fails.
// If the event never arrives, the detection in Rust is wrong (the URL the
// WebView2 error page reports is not one of the patterns checked).

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const r = await cdp.runAsync(`
  const _term = window.__ZEPHYR_TERM__;
  const { listen } = await import('@tauri-apps/api/event');

  // rekam semua event browser-pane-load
  window.__evLoad = [];
  const un = await listen('browser-pane-load', (e) => {
    window.__evLoad.push(e.payload);
  });

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

  await new Promise(r => setTimeout(r, 6000));
  un();

  return JSON.stringify({
    jumlahEvent: window.__evLoad.length,
    event: window.__evLoad.slice(0, 5),
    adaPanel: !!document.querySelector('[data-testid="bp-error"]'),
  });
`, 90000);

console.log(r);
await cdp.close();
