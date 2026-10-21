import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
const hasil = await cdp.eval(
  `(async () => {
     try { await window.__ZEPHYR_GIT__.refresh(); return 'ok:' + JSON.stringify(window.__ZEPHYR_GIT__.status())?.slice(0, 160); }
     catch (e) { return 'ERR:' + (e && (e.message || e.code) ? (e.message || e.code) : String(e)); }
   })()`,
  60000,
);
console.log(hasil);
cdp.close();
