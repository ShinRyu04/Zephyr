import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

for (const expr of [
  `1+1`,
  `typeof window.__ZEPHYR__`,
  `JSON.stringify(window.__ZEPHYR__.getState().tabs.length)`,
  `window.__ZEPHYR__.getState().recents.length`,
]) {
  try {
    console.log(expr, '=>', await cdp.eval(expr, 15000));
  } catch (e) {
    console.log(expr, '=> ERR', e.message);
  }
}
cdp.close();
