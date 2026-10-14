import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const H = window.__ZEPHYR_RIWAYAT__ ? window.__ZEPHYR_RIWAYAT__() : null;
  if (!H) return {err:'no bridge', keys:Object.keys(window).filter(k=>/ZEPHYR/.test(k))};
  const tools = H.filter(m=>m.role==='tool').slice(-8).map(m=>({name:m.name, len:String(m.content||'').length, c:String(m.content||'').slice(0,220)}));
  const roles = H.map(m=>m.role).join(',');
  return { n:H.length, roles: roles.slice(-200), tools };
})())`);
console.log(r);
await cdp.close();
