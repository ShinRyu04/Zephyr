// uji-t9-browser-agent.mjs — prove the agent can actually read and click a
// page inside the browser pane.
//
// The whole point of moving off the iframe was that the agent could see and
// act. A check that only opens a pane would pass with an iframe too, so every
// step below goes through browser_pane_eval: read the title, read the text,
// click a link, read the result.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const hasil = await cdp.runAsync(`
  await new Promise(r => setTimeout(r, 2000));
  const out = {};
  const mod = await import('/src/lib/commands.ts');
  const cmd = mod.default ?? mod;
  const tools = await import('/src/lib/agentTools.ts');
  const t = await import('/src/lib/terminalStore.ts');
  const useTerminal = t.useTerminal ?? t.default;

  // 1. tool browser terdaftar untuk agent?
  const spec = tools.agentToolSpecs();
  out.toolBrowser = spec.filter(s => s.name.startsWith('browser_')).map(s => s.name);
  out.totalTool = spec.length;

  // 2. buka pane browser
  const store = useTerminal.getState();
  let paneId = store.allPanes().find(p => p.kind === 'browser')?.id;
  if (!paneId) {
    paneId = await store.addPane('browser');
    await new Promise(r => setTimeout(r, 1200));
  }
  out.paneId = paneId;

  // 3. buka halaman nyata lewat command Rust
  try {
    await cmd.browserPaneOpen({
      paneId, url: 'https://example.com',
      x: 0, y: 0, width: 800, height: 600,
    });
    await new Promise(r => setTimeout(r, 3500));
    out.openOk = true;
  } catch (e) { out.openErr = String(e).slice(0, 200); }

  // 4. BACA isi halaman — ini inti perubahannya
  try {
    const info = await cmd.browserPaneInfo(paneId);
    out.judul = info.title;
    out.url = info.url;
  } catch (e) { out.infoErr = String(e).slice(0, 200); }

  try {
    const teks = await cmd.browserPaneEval(paneId, 'document.body.innerText.slice(0,300)');
    out.teksHalaman = String(teks).slice(0, 250);
  } catch (e) { out.evalErr = String(e).slice(0, 200); }

  // 5. BACA daftar link
  try {
    const link = await cmd.browserPaneEval(paneId,
      'JSON.stringify(Array.from(document.querySelectorAll("a")).map(a => a.innerText + " -> " + a.href).slice(0,3))');
    out.link = String(link).slice(0, 300);
  } catch (e) { out.linkErr = String(e).slice(0, 200); }

  // 6. KLIK link — bukti agent bisa bertindak, bukan cuma membaca
  try {
    const klik = await cmd.browserPaneEval(paneId,
      'document.querySelector("a") ? (document.querySelector("a").click(), "diklik") : "tidak ada link"');
    out.klik = String(klik);
    await new Promise(r => setTimeout(r, 2500));
    const setelah = await cmd.browserPaneInfo(paneId);
    out.urlSetelahKlik = setelah.url;
    out.judulSetelahKlik = setelah.title;
  } catch (e) { out.klikErr = String(e).slice(0, 200); }

  // 7. tool browser_open lewat agent (jalur yang dipakai AI)
  try {
    const tool = tools.AGENT_TOOLS.find(x => x.spec.name === 'browser_open');
    const r = await tool.run({ url: 'https://example.com', paneId });
    out.toolOpen = String(r).slice(0, 200);
  } catch (e) { out.toolErr = String(e).slice(0, 250); }

  return JSON.stringify(out);
`);

console.log(hasil);
await cdp.close();
