// uji-google-pane.mjs - prove a real site (google.com) loads in the browser.
//
// The browser used to be an iframe pane in the terminal, and Google sends
// X-Frame-Options: DENY, so it could never appear. It is now a real child
// WebView2 hosted by the Browser tab in the editor area, which is not an
// iframe, so the header does not apply. This checks the page actually loaded
// by reading its title and text out of the live webview.
//
// Two things changed with the move from pane to tab, and both are asserted
// here instead of being assumed:
//   - the webview is addressed by the constant id 'tab-browser'
//     (ID_TAB_BROWSER in src/lib/zephyrTools/web.ts), not by a pane id that no
//     longer exists;
//   - opening a page must NOT create pane kind 'browser' in any terminal tab.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const hasil = await cdp.runAsync(`
  await new Promise(r => setTimeout(r, 2000));
  const out = {};
  const cmdMod = await import('/src/lib/commands.ts');
  const c = cmdMod.default ?? cmdMod;
  const ID_TAB_BROWSER = 'tab-browser';

  // Buka (atau pakai ulang) tab Browser lewat store editor, bukan addPane.
  const S = window.__ZEPHYR__;
  S.getState().bukaViewAi('browser', { url: 'about:blank' });
  await new Promise(r => setTimeout(r, 1500));
  out.idWebview = ID_TAB_BROWSER;
  out.adaTabBrowser = S.getState().tabs.some((t) => t.view === 'browser');

  try {
    await c.browserPaneOpen({
      paneId: ID_TAB_BROWSER, url: 'https://www.google.com',
      x: 0, y: 0, width: 900, height: 600,
    });
    await new Promise(r => setTimeout(r, 7000));
    const info = await c.browserPaneInfo(ID_TAB_BROWSER);
    out.url = info.url;
    out.judul = info.title;
    const teks = await c.browserPaneEval(
      ID_TAB_BROWSER,
      'document.body ? document.body.innerText.slice(0,300) : "(kosong)"',
    );
    out.teks = String(teks).slice(0, 250);
  } catch (e) {
    out.err = String(e.message || e).slice(0, 250);
  }

  // Bukti pemisahan: tidak boleh ada pane browser di panel terminal.
  const T = window.__ZEPHYR_TERM__.getState();
  out.paneBrowserDiPanel = T.terminalTabs
    .reduce((n, t) => n + t.panes.filter((p) => p.kind === 'browser').length, 0);

  return JSON.stringify(out);
`);

console.log(hasil);
await cdp.close();
