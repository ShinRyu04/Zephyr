import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
console.log(
  await cdp.eval(
    `(window.__ZEPHYR_GIT__ ? Object.keys(window.__ZEPHYR_GIT__).join(',') : 'TIDAK ADA') + ' || st=' + JSON.stringify(window.__ZEPHYR_GIT__?.status?.())`,
    30000,
  ),
);
cdp.close();
