import { Cdp } from '../scripts/lib-cdp.mjs';
import WebSocket from 'ws';

const PORT = 9223;
const daftar = async () =>
  (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json());

// Buka jendela models lewat jendela utama
const list0 = await daftar();
const utama = list0.find((t) => t.type === 'page' && !(t.url ?? '').includes('#'));
const c = await Cdp.connect(utama.webSocketDebuggerUrl);
console.log('bridge:', await c.eval(`typeof window.__ZEPHYR_AIMODELS__`));
await c.eval(`(() => { window.__PROBE_OPEN__ = null; window.__ZEPHYR_AIMODELS__.buka(); return 1; })()`);
await new Promise((r) => setTimeout(r, 4000));
console.log('window label exists:', await c.eval(`
  (async () => {
    try {
      const m = await import('/node_modules/@tauri-apps/api/webviewWindow.js');
      return 'mod ok';
    } catch (e) { return 'mod err ' + e.message; }
  })()`).catch((e) => 'err ' + e.message));
c.close();

const list1 = await daftar();
for (const t of list1.filter((x) => x.type === 'page')) console.log(t.title, '|', t.url);
