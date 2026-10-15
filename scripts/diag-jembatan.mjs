/**
 * diag-jembatan.mjs - kenapa jembatan baca-kode tidak terpasang?
 *   node scripts/diag-jembatan.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const out = {};
  out.adaBridgeZephyr = !!window.__ZEPHYR__;
  out.adaBridgeTools = !!window.__ZEPHYR_TOOLS__;
  out.toolsKeys = window.__ZEPHYR_TOOLS__ ? Object.keys(window.__ZEPHYR_TOOLS__) : null;
  out.wsApp = window.__ZEPHYR__ ? window.__ZEPHYR__.getState().workspace : null;

  const at = await import('/src/lib/agentTools.ts');
  out.punyaPasang = typeof at.pasangJembatanBacaKodeDariWorkspace;
  try { out.pasang = at.pasangJembatanBacaKodeDariWorkspace(); } catch (e) { out.pasangErr = String(e).slice(0,200); }

  const bk = await import('/src/lib/bacaKode.ts');
  out.jembatan = !!bk.jembatanBacaKode();

  const st = await import('/src/lib/store.ts');
  out.wsStoreImport = st.useStore.getState().workspace;
  out.storeSamaDenganApp = st.useStore === (window.__ZEPHYR__ ? window.__ZEPHYR__.getState().__store : undefined);
  return out;
`);
console.log(JSON.stringify(typeof r === 'string' ? JSON.parse(r) : r, null, 1));
await cdp.close();
