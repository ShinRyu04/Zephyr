import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = daftar.find((t) => t.type === 'page' && !t.url.includes('#'));
console.log('target:', utama?.url);
const cdp = await Cdp.Cdp.connect(utama.webSocketDebuggerUrl);
console.log(
  await cdp.eval(
    `'ws=' + (window.__ZEPHYR__?.getState().workspace ?? '') + ' isRepo=' + (window.__ZEPHYR_GIT__?.status()?.isRepo) + ' n=' + (window.__ZEPHYR_GIT__?.status()?.changes.length)`,
    25000,
  ),
);
cdp.close();
