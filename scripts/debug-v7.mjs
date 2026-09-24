// debug-v7.mjs — run the phase-06 V7 steps by hand, one at a time, printing
// after each one so the step that hangs is obvious.
//
// V7 used to hang with no output because the harness only printed the final
// result. Splitting the steps makes the failing one visible.

import { Cdp } from './lib-cdp.mjs';
import { createServer } from 'node:http';

const TEST_PORT = 8099;
const MARKER = 'HALO-DARI-BROWSER-PANE';

const srv = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body><h1 id="marker">${MARKER}</h1></body></html>`);
});
await new Promise((r) => srv.listen(TEST_PORT, '127.0.0.1', r));
console.log(`  server uji siap di ${TEST_PORT}`);

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const langkah = [
  ['tutup semua tab', `
    for (const x of window.__ZEPHYR_TERM__.getState().terminalTabs.slice())
      await window.__ZEPHYR_TERM__.getState().closeTab(x.id);
    await new Promise(r => setTimeout(r, 1000));
    return JSON.stringify({ tabs: window.__ZEPHYR_TERM__.getState().terminalTabs.length });
  `],
  ['klik split-browser', `
    const b = document.querySelector('[data-testid="empty-split-browser"]');
    if (!b) return JSON.stringify({ err: 'tombol tidak ada' });
    b.click();
    await new Promise(r => setTimeout(r, 3000));
    const panes = window.__ZEPHYR_TERM__.getState().allPanes();
    return JSON.stringify({ panes: panes.map(p => p.kind) });
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
  ['browser_nav lewat tool', `
    const t = window.__ZEPHYR_TOOLS__;
    if (!t) return JSON.stringify({ err: '__ZEPHYR_TOOLS__ tidak ada' });
    const nav = t.find(x => x.spec.name === 'browser_nav');
    if (!nav) return JSON.stringify({ err: 'tool tidak ada' });
    const bp = window.__ZEPHYR_TERM__.getState().allPanes().find(p => p.kind === 'browser');
    if (!bp) return JSON.stringify({ err: 'pane browser tidak ada' });
    await nav.run({ paneId: bp.id, aksi: 'http://127.0.0.1:${TEST_PORT}/' });
    await new Promise(r => setTimeout(r, 3000));
    return JSON.stringify({ ok: true, url: bp.url });
  `],
  ['browser_read', `
    const t = window.__ZEPHYR_TOOLS__;
    const read = t.find(x => x.spec.name === 'browser_read');
    const bp = window.__ZEPHYR_TERM__.getState().allPanes().find(p => p.kind === 'browser');
    const h = await read.run({ paneId: bp.id });
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
