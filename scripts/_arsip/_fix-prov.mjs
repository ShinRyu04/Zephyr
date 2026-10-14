import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const S = window.__ZEPHYR__.getState();
  const prov = S.settings.models.providers;
  return { custom: prov.custom, custom2: prov.custom2, active: S.settings.models.activeProvider };
})())`);
console.log('PROVIDERS:', JSON.stringify(r,null,1));
await cdp.close();
