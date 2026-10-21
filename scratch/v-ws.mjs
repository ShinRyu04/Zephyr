import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

/* Jendela agents baru dibuka ulang (reload) dan belum punya workspace. */
await cdp.eval(`window.__ZEPHYR__.getState().openWorkspace('D:/Zephyr')`, 60000);
await new Promise((x) => setTimeout(x, 3000));
console.log(await cdp.eval(`'ws=' + (window.__ZEPHYR__.getState().workspace ?? '')`, 20000));
cdp.close();
