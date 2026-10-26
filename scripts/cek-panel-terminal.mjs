// cek-panel-terminal.mjs - is the terminal panel actually on screen?
//
// The pane showed up in the store but its element measured 0x0, which meant the
// panel itself was not rendered. This prints what the DOM has so the difference
// between "panel closed" and "panel open but empty" is visible.
//
// The browser is no longer a pane here - it is a tab in the editor area - so
// this now also reports whether the Browser tab exists and how tall its host
// is, which is the metric that matters for the child WebView2.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const r = await cdp.runAsync(`
  const _term = window.__ZEPHYR_TERM__;
  const st = _term.getState();

  const out = {};
  out.visible = st.visible;
  out.panesDiStore = st.allPanes().map(p => p.kind);
  out.tabs = st.terminalTabs.length;

  out.adaPanel = !!document.querySelector('.panel, .term-panel, [data-testid="panel"]');
  out.semuaPanel = [...document.querySelectorAll('[class*="panel"]')].slice(0, 6).map(e => e.className);
  out.adaPaneBody = document.querySelectorAll('.pane-body').length;
  out.adaGrid = document.querySelectorAll('.pane-grid').length;
  out.adaXterm = document.querySelectorAll('.xterm').length;
  out.adaEmpty = !!document.querySelector('[data-testid="empty-shell"]');
  out.adaSplitBtn = !!document.querySelector('[data-testid="empty-split-browser"]');

  // Browser = tab editor, bukan pane. Yang diukur rect host-nya.
  const S = window.__ZEPHYR__;
  const tabBrowser = S ? S.getState().tabs.find(t => t.view === 'browser') : null;
  out.adaTabBrowser = !!tabBrowser;
  out.idTabBrowser = tabBrowser?.id ?? null;
  out.urlTabBrowser = tabBrowser?.url ?? null;
  const host = document.querySelector('.bp-tab-host');
  const rh = host?.getBoundingClientRect();
  out.rectHostBrowser = rh ? [Math.round(rh.left), Math.round(rh.top), Math.round(rh.width), Math.round(rh.height)] : null;
  out.paneBrowserDiPanel = st.terminalTabs
    .reduce((n, t) => n + t.panes.filter(p => p.kind === 'browser').length, 0);

  // buka panel dengan cara yang dipakai UI
  out.bridgePanel = !!window.__ZEPHYR_PANEL__;
  if (window.__ZEPHYR_PANEL__) {
    const P = window.__ZEPHYR_PANEL__;
    out.panelTabSebelum = P.store?.getState?.()?.activeTab ?? P.getState?.()?.activeTab ?? null;
    P.store?.getState?.().setOpen?.(true);
    await new Promise(r => setTimeout(r, 1200));
    out.adaPaneBodySetelah = document.querySelectorAll('.pane-body').length;
    const panePertama = st.allPanes()[0];
    const el = panePertama ? document.querySelector('.pane-body:has([data-pane-body="' + panePertama.id + '"])') : null;
    const rr = el?.getBoundingClientRect();
    out.rectPaneShellSetelah = rr ? [Math.round(rr.left), Math.round(rr.top), Math.round(rr.width), Math.round(rr.height)] : null;
    const host2 = document.querySelector('.bp-tab-host');
    const rh2 = host2?.getBoundingClientRect();
    out.rectHostBrowserSetelah = rh2 ? [Math.round(rh2.left), Math.round(rh2.top), Math.round(rh2.width), Math.round(rh2.height)] : null;
  }

  return JSON.stringify(out);
`, 60000);

console.log(r);
await cdp.close();
