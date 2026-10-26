// cek-posisi-pane.mjs - measure the browser rectangle over time after the agent
// opens a page.
//
// This used to measure a terminal pane of kind 'browser'. That pane no longer
// exists: the browser is a tab in the editor area, hosted by `.bp-tab-host` and
// addressed by the constant webview id 'tab-browser'. What used to be a timing
// question (the pane read [0,0,0,0] before React laid it out) is now a
// visibility question - the child WebView2 is only positioned while its host is
// on screen - so this samples the host rectangle AND the tab state together.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const ID_TAB_BROWSER = 'tab-browser';

const r = await cdp.runAsync(`
  const S = window.__ZEPHYR__;
  const _term = window.__ZEPHYR_TERM__;

  // Panel terminal ditutup dan tab browser lama dibersihkan supaya yang diukur
  // hanya tab yang dibuka di bawah ini.
  for (const t of _term.getState().terminalTabs.slice()) await _term.getState().closeTab(t.id);
  for (const t of S.getState().tabs.filter((x) => x.view === 'browser')) {
    S.getState().forceCloseTab(t.id);
  }
  await new Promise(r => setTimeout(r, 900));

  const tools = window.__ZEPHYR_TOOLS__;
  const hasil = await tools.jalankan('browser', { aksi: 'open', url: 'https://example.com' });

  const jejak = [];
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    const tab = S.getState().tabs.find((x) => x.view === 'browser');
    const el = document.querySelector('.bp-tab-host');
    const rr = el?.getBoundingClientRect();
    jejak.push({
      t: (i + 1) * 500,
      tabAda: !!tab,
      hostAda: !!el,
      rect: rr ? [Math.round(rr.left), Math.round(rr.top), Math.round(rr.width), Math.round(rr.height)] : null,
    });
  }

  const tab = S.getState().tabs.find((x) => x.view === 'browser');
  const paneBrowserDiPanel = _term.getState().terminalTabs
    .reduce((n, t) => n + t.panes.filter((p) => p.kind === 'browser').length, 0);

  return JSON.stringify({
    hasil: String(hasil).slice(0, 70),
    tabId: tab?.id ?? null,
    urlStore: tab?.url ?? null,
    idWebview: '${ID_TAB_BROWSER}',
    paneBrowserDiPanel,
    jejak,
  });
`, 90000);

console.log(r);
await cdp.close();
