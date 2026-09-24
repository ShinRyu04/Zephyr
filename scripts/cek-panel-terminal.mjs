// cek-panel-terminal.mjs — is the terminal panel actually on screen?
//
// The pane shows up in the store but its element measures 0x0, which means the
// panel itself is not rendered. This prints what the DOM has so the difference
// between "panel closed" and "panel open but empty" is visible.

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

  // buka panel dengan cara yang dipakai UI
  out.bridgePanel = !!window.__ZEPHYR_PANEL__;
  if (window.__ZEPHYR_PANEL__) {
    const P = window.__ZEPHYR_PANEL__;
    out.panelTabSebelum = P.store?.getState?.()?.activeTab ?? P.getState?.()?.activeTab ?? null;
    P.store?.getState?.().setOpen?.(true);
    await new Promise(r => setTimeout(r, 1200));
    out.adaPaneBodySetelah = document.querySelectorAll('.pane-body').length;
    const bp = st.allPanes().find(p => p.kind === 'browser');
    const el = bp ? document.querySelector('.pane-body:has([data-pane-body="' + bp.id + '"])') : null;
    const rr = el?.getBoundingClientRect();
    out.rectSetelah = rr ? [Math.round(rr.left), Math.round(rr.top), Math.round(rr.width), Math.round(rr.height)] : null;
  }

  return JSON.stringify(out);
`, 60000);

console.log(r);
await cdp.close();
