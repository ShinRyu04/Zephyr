import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr', 'localhost']);
const s = await cdp.json(`return JSON.stringify((() => {
  const D = window.__ZEPHYR_AI__;
  const out = { kunciGlobal: Object.keys(D), };
  const ds = D.debugStore || null;
  out.adaDebug = !!ds;
  if (ds && ds.getState) {
    const st = ds.getState();
    out.kunciDebug = Object.keys(st).slice(0, 30);
    const ent = st.entries || st.records || st.log || [];
    out.nEntri = ent.length;
    const terakhir = ent[ent.length - 1];
    out.entriTerakhir = terakhir ? Object.keys(terakhir) : null;
    if (terakhir) {
      out.potongan = JSON.stringify(terakhir).slice(0, 1500);
    }
  }
  return out;
})())`);
console.log(JSON.stringify(s, null, 1));
await cdp.close();
