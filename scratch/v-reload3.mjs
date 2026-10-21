import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
console.log('bridge git:', await cdp.eval(`typeof window.__ZEPHYR_GIT__`, 15000));
await cdp.eval(`location.reload()`, 5000).catch(() => {});
cdp.close();
console.log('reload dikirim');
