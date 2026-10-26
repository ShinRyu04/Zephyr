// debug-v7.mjs - run the phase-06 V7 steps by hand, one at a time, printing
// after each one so the step that hangs is obvious.
//
// V7 used to hang with no output because the harness only printed the final
// result. Splitting the steps makes the failing one visible.
//
// Rebased onto the Browser TAB: the browser is no longer a terminal pane, so
// clicking `empty-split-browser` now creates a tab in the editor area and every
// step reads `Tab.url` / the `browser` tool instead of a pane id. The old
// `browser_nav` tool no longer exists either - navigation is `browser` with
// `aksi: 'open'`, so the step was retargeted at that.

import { Cdp } from './lib-cdp.mjs';
import { createServer } from 'node:http';

const TEST_PORT = 8099;
const MARKER = 'HALO-DARI-BROWSER-TAB';

const srv = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body><h1 id="marker">${MARKER}</h1></body></html>`);
});
await new Promise((r) => srv.listen(TEST_PORT, '127.0.0.1', r));
console.log(`  server uji siap di ${TEST_PORT}`);

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const langkah = [
  ['bersihkan tab', `
    const S = window.__ZEPHYR__;
    for (const t of S.getState().tabs.filter(x => x.view === 'browser')) {
      S.getState().forceCloseTab(t.id);
    }
    for (const x of window.__ZEPHYR_TERM__.getState().terminalTabs.slice())
      await window.__ZEPHYR_TERM__.getState().closeTab(x.id);
    await new Promise(r => setTimeout(r, 1000));
    return JSON.stringify({
      tabTerminal: window.__ZEPHYR_TERM__.getState().terminalTabs.length,
      tabBrowser: S.getState().tabs.filter(x => x.view === 'browser').length,
    });
  `],
  ['klik split-browser', `
    const b = document.querySelector('[data-testid="empty-split-browser"]');
    if (!b) return JSON.stringify({ err: 'tombol tidak ada' });
    b.click();
    await new Promise(r => setTimeout(r, 3000));
    const S = window.__ZEPHYR__;
    const panes = window.__ZEPHYR_TERM__.getState().allPanes();
    return JSON.stringify({
      tabBrowser: S.getState().tabs.filter(x => x.view === 'browser').map(x => x.id),
      panes: panes.map(p => p.kind),
    });
  `],
  ['isi address bar', `
    const inp = document.querySelector('[data-testid="bp-url"]');
    if (!inp) return JSON.stringify({ err: 'bp-url tidak ada' });
    const setV = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setV.call(inp, '127.0.0.1:${TEST_PORT}');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 1500));
    return JSON.stringify({ ok: true, nilai: inp.value });
  `],
  ['browser open lewat tool', `
    const T = window.__ZEPHYR_TOOLS__;
    if (!T) return JSON.stringify({ err: '__ZEPHYR_TOOLS__ tidak ada' });
    const hasil = await T.jalankan('browser', { aksi: 'open', url: 'http://127.0.0.1:${TEST_PORT}/' });
    await new Promise(r => setTimeout(r, 3000));
    const tab = window.__ZEPHYR__.getState().tabs.find(x => x.view === 'browser');
    return JSON.stringify({ ok: true, balasan: String(hasil).slice(0, 120), tabId: tab?.id ?? null, url: tab?.url ?? null });
  `],
  ['browser read', `
    const h = await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'read' });
    return JSON.stringify({ bacaan: String(h).slice(0, 200) });
  `],
];

for (const [nama, body] of langkah) {
  const t0 = Date.now();
  try {
    const r = await cdp.runAsync(body, 60000);
    console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${nama}: ${r}`);
  } catch (e) {
    console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${nama}: GAGAL -> ${String(e.message || e).slice(0, 200)}`);
  }
}

await cdp.close();
srv.close();
