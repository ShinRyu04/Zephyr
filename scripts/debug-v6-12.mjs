// debug-v6-12.mjs - inspect the exact values the phase-12 V6 check sees.
//
// The harness reports a failure whose own message contains the expected text,
// so the comparison is the thing to inspect, not the page.
//
// The browser is now a tab in the editor area, not a pane in the terminal tab,
// so the page text is read through the `browser` tool (aksi read) and the URL
// lives in the editor store (`Tab.url`), not in a pane.

import { Cdp } from './lib-cdp.mjs';
import { createServer } from 'node:http';

const TEST_PORT = 8099;
const MARKER = 'ZEPHYR-BROWSER-PANE-OK';

const srv = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<html><body><h1>${MARKER}</h1></body></html>`);
});
await new Promise((r) => srv.listen(TEST_PORT, '127.0.0.1', r));

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const r = await cdp.runAsync(`
  const _term = window.__ZEPHYR_TERM__;

  // Tab browser lama ditutup supaya yang diuji hanya tab yang dibuka di sini.
  for (const t of window.__ZEPHYR__.getState().tabs.filter(x => x.view === 'browser')) {
    window.__ZEPHYR__.getState().forceCloseTab(t.id);
  }
  for (const t of _term.getState().terminalTabs.slice()) await _term.getState().closeTab(t.id);
  await new Promise(r => setTimeout(r, 800));
  _term.getState().setVisible(true);
  _term.getState().newTab();
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('[data-testid="empty-split-browser"]').click();
  await new Promise(r => setTimeout(r, 2500));

  const el = document.querySelector('[data-testid="bp-url"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, 'localhost:${TEST_PORT}');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  el.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 3500));

  const isi = String(await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'read' }));
  const tab = window.__ZEPHYR__.getState().tabs.find(x => x.view === 'browser');
  const paneBrowserDiPanel = _term.getState().terminalTabs
    .reduce((n, t) => n + t.panes.filter(p => p.kind === 'browser').length, 0);

  return JSON.stringify({
    tabId: tab?.id ?? null,
    url: tab?.url ?? null,
    paneBrowserDiPanel,
    panjangIsi: isi.length,
    isiPenuh: isi,
    adaMarker: isi.includes('${MARKER}'),
    kodeChar: [...isi.slice(0, 90)].map(c => c.charCodeAt(0)),
    teks90: isi.slice(0, 90),
  });
`, 90000);

console.log(r);
await cdp.close();
srv.close();
