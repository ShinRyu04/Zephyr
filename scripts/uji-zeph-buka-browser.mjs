// uji-zeph-buka-browser.mjs — prove the agent tool opens a page in the
// terminal's browser pane, and that the pane lands in the right place.
//
// IMPORTANT: this harness must read the store through window.__ZEPHYR_TERM__
// (the bridge the UI itself uses). A bare `import('/src/lib/terminalStore.ts')`
// inside the evaluated snippet creates a SEPARATE module instance in Vite, so
// it reports an empty pane list even when the UI has panes on screen. Reading
// the wrong instance is what made an earlier version of this test report a
// failure that did not exist.
//
// The bug this guards against: browser_open hardcoded x:0, y:0, which put the
// child webview in the top-left corner of the window, floating over the editor
// and the sidebar, and it never wrote the URL into the pane store, so the
// component's position-sync loop never started.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const hasil = await cdp.runAsync(`
  await new Promise(r => setTimeout(r, 2500));
  const out = {};
  const term = window.__ZEPHYR_TERM__;

  // Close any browser pane left over from an earlier run.
  for (const p of term.getState().allPanes()) {
    await term.getState().closePane(p.id);
  }
  await new Promise(r => setTimeout(r, 1000));
  out.sebelum = term.getState().allPanes().length;

  const tools = await import('/src/lib/agentTools.ts');
  const tool = tools.AGENT_TOOLS.find(t => t.spec.name === 'browser_open');
  out.adaTool = !!tool;

  try {
    const h = await tool.run({ url: 'https://www.google.com' });
    out.hasil = String(h).slice(0, 200);
  } catch (e) {
    out.err = String(e.message || e).slice(0, 250);
  }

  await new Promise(r => setTimeout(r, 2500));
  const bp = term.getState().allPanes().find(p => p.kind === 'browser');
  out.paneAda = !!bp;
  out.paneId = bp?.id;
  out.urlStore = bp?.url;

  if (bp) {
    const el = document.querySelector('.pane-body:has([data-pane-body="' + bp.id + '"])');
    const rr = el?.getBoundingClientRect();
    out.paneRect = rr
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
