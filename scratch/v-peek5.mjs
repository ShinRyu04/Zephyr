import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
console.log(
  await cdp.eval(
    `'ws=' + (window.__ZEPHYR__?.getState().workspace ?? '') + ' isRepo=' + (window.__ZEPHYR_GIT__?.status()?.isRepo) + ' n=' + (window.__ZEPHYR_GIT__?.status()?.changes.length)`,
    20000,
  ),
);
cdp.close();
