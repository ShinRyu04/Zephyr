// uji-google-pane.mjs — prove a real site (google.com) loads in the browser pane.
//
// The pane used to be an iframe, and Google sends X-Frame-Options: DENY, so it
// could never appear. It is now a real child WebView2, which is not an iframe,
// so the header does not apply. This checks the page actually loaded by reading
// its title and text out of the live DOM.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const hasil = await cdp.runAsync(`
  await new Promise(r => setTimeout(r, 2000));
  const out = {};
  const cmdMod = await import('/src/lib/commands.ts');
  const c = cmdMod.default ?? cmdMod;
  const tm = await import('/src/lib/terminalStore.ts');
  const term = tm.useTerminal ?? tm.default;
  const st = term.getState();

  let paneId = st.allPanes().find(p => p.kind === 'browser')?.id;
  if (!paneId) {
    paneId = await st.addPane('browser');
    await new Promise(r => setTimeout(r, 1500));
  }
  out.paneId = paneId;

  try {
    await c.browserPaneOpen({
      paneId, url: 'https://www.google.com',
      x: 0, y: 0, width: 900, height: 600,
    });
    await new Promise(r => setTimeout(r, 7000));
    const info = await c.browserPaneInfo(paneId);
    out.url = info.url;
    out.judul = info.title;
    const teks = await c.browserPaneEval(
      paneId,
      'document.body ? document.body.innerText.slice(0,300) : "(kosong)"',
    );
    out.teks = String(teks).slice(0, 250);
  } catch (e) {
    out.err = String(e.message || e).slice(0, 250);
  }

  return JSON.stringify(out);
`);

console.log(hasil);
await cdp.close();
