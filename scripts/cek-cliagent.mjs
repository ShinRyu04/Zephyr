import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(`return JSON.stringify(await (async () => {
  const X = window.__ZEPHYR_CLIAGENT__;
  if (!X) return { ada: false };
  const hasil = { ada: true, kunci: Object.keys(X) };
  try {
    await X.detect(true);
    hasil.agents = X.agents();
    hasil.jumlah = X.agents().length;
  } catch (e) { hasil.error = String(e).slice(0, 300); }
  return hasil;
})())`);
console.log(JSON.stringify(r, null, 1).slice(0, 1500));
await cdp.close();
