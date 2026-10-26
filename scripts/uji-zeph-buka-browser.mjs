// uji-zeph-buka-browser.mjs — prove the agent tool opens a page in the
// BROWSER TAB (it used to be a pane inside the terminal panel) and that the
// tab's stage lands in the right place.
//
// IMPORTANT: this harness reads the store through window.__ZEPHYR__ (the
// bridge the UI itself uses). A bare `import('/src/lib/store.ts')` inside the
// evaluated snippet creates a SEPARATE module instance in Vite, so it reports
// an empty tab list even when the UI has tabs on screen.
//
// The bug this guards against (still worth guarding after the move to a tab):
// `browser_open` once hardcoded x:0, y:0, which put the child webview in the
// top-left corner of the window, floating over the editor and the sidebar, and
// it never wrote the URL into the store, so the component's position-sync loop
// never started.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const hasil = await cdp.runAsync(`
  await new Promise(r => setTimeout(r, 2500));
  const out = {};
  const S = window.__ZEPHYR__;

  // Close any browser tab left over from an earlier run.
  for (const t of (S.getState().tabs || [])) {
    if (t && t.view === 'browser') S.getState().forceCloseTab(t.id);
  }
  await new Promise(r => setTimeout(r, 800));
  out.sebelum = (S.getState().tabs || []).filter(t => t.view === 'browser').length;

  const tools = await import('/src/lib/agentTools.ts');
  const tool = tools.AGENT_TOOLS.find(t => t.spec.name === 'browser');
  out.adaTool = !!tool;

  try {
    const h = await tool.run({ aksi: 'open', url: 'https://www.google.com' });
    out.hasil = String(h).slice(0, 200);
  } catch (e) {
    out.err = String(e.message || e).slice(0, 250);
  }

  await new Promise(r => setTimeout(r, 2500));
  const st = S.getState();
  const tab = (st.tabs || []).find(t => t && t.view === 'browser');
  out.tabAda = !!tab;
  out.tabId = tab?.id;
  out.urlStore = tab?.url;
  out.paneBrowserDiPanel = 0;
  try {
    const ts = window.__ZEPHYR_TERM__.getState();
    for (const tb of (ts.terminalTabs || [])) {
      for (const p of (tb.panes || [])) if (p && p.kind === 'browser') out.paneBrowserDiPanel++;
    }
  } catch { out.paneBrowserDiPanel = -1; }

  if (tab) {
    const el = document.querySelector('.bp-tab-host');
    const rr = el?.getBoundingClientRect();
    out.stageRect = rr
      ? [Math.round(rr.left), Math.round(rr.top), Math.round(rr.width), Math.round(rr.height)]
      : null;
    // The old bug put it at the very top-left corner, over the sidebar.
    out.diPojokKiri = rr ? rr.left < 40 && rr.top < 40 : null;
    out.terlihatDiLayar = rr ? rr.width > 100 && rr.height > 100 : null;
  }

  return JSON.stringify(out);
`);

console.log(hasil);
await cdp.close();
