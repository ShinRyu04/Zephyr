// uji-t9-browser-agent.mjs - prove the agent's browser tools drive the page.
//
// Moved from a browser pane to the Browser tab: the webview is addressed by
// the constant id 'tab-browser' (ID_TAB_BROWSER in
// src/lib/zephyrTools/web.ts), so every command here takes that id instead of
// a pane id, and no terminal pane of kind 'browser' may be created.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const hasil = await cdp.runAsync(`
  await new Promise(r => setTimeout(r, 2000));
  const out = {};
  const cmdMod = await import('/src/lib/commands.ts');
  const cmd = cmdMod.default ?? cmdMod;
  const ID_TAB_BROWSER = 'tab-browser';

  // Tab Browser dibuat lewat store editor (satu tab tetap, bukan pane).
  window.__ZEPHYR__.getState().bukaViewAi('browser', { url: 'about:blank' });
  await new Promise(r => setTimeout(r, 1500));
  out.adaTabBrowser = window.__ZEPHYR__.getState().tabs.some((t) => t.view === 'browser');
  out.idWebview = ID_TAB_BROWSER;

  try {
    await cmd.browserPaneOpen({
      paneId: ID_TAB_BROWSER, url: 'https://example.com',
      x: 0, y: 0, width: 900, height: 600,
    });
    await new Promise(r => setTimeout(r, 6000));
    const info = await cmd.browserPaneInfo(ID_TAB_BROWSER);
    out.url = info.url;
    out.judul = info.title;

    const teks = await cmd.browserPaneEval(ID_TAB_BROWSER, 'document.body.innerText.slice(0,300)');
    out.teks = String(teks).slice(0, 200);

    // tautan: eja isi anchor pertama (navigasi sendiri tidak diuji di sini,
    // karena example.com hanya punya satu tautan keluar ke iana.org).
    const link = await cmd.browserPaneEval(ID_TAB_BROWSER,
      '(() => { const a = document.querySelector("a"); return a ? { href: a.href, teks: a.textContent.trim() } : null; })()');
    out.tautan = JSON.stringify(link);

    const klik = await cmd.browserPaneEval(ID_TAB_BROWSER,
      '(() => { const a = document.querySelector("a"); if (!a) return "tidak ada tautan"; a.click(); return "diklik"; })()');
    out.klik = String(klik);
    await new Promise(r => setTimeout(r, 4000));
    const setelah = await cmd.browserPaneInfo(ID_TAB_BROWSER);
    out.urlSetelahKlik = setelah.url;
  } catch (e) {
    out.err = String(e.message || e).slice(0, 250);
  }

  // Jalur tool agent: 'browser' dengan aksi open tidak boleh membuat tab kedua.
  try {
    const tools = window.__ZEPHYR_TOOLS__;
    if (tools?.jalankan) {
      out.hasilTool = String(await tools.jalankan('browser', { aksi: 'open', url: 'https://example.com' })).slice(0, 200);
    } else {
      out.hasilTool = '(bridge tool tidak ada)';
    }
  } catch (e) {
    out.errTool = String(e.message || e).slice(0, 250);
  }
  out.jumlahTabBrowser = window.__ZEPHYR__.getState().tabs.filter((t) => t.view === 'browser').length;

  const T = window.__ZEPHYR_TERM__.getState();
  out.paneBrowserDiPanel = T.terminalTabs
    .reduce((n, t) => n + t.panes.filter((p) => p.kind === 'browser').length, 0);

  return JSON.stringify(out);
`);

console.log(hasil);
await cdp.close();
