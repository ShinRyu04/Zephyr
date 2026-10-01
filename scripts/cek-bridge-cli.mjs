import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.eval(`(() => {
  const X = window.__ZEPHYR_CLI__;
  if (!X) return { ada: false, kunci: Object.keys(window).filter(k => k.includes('ZEPHYR')).slice(0, 20) };
  return { ada: true, kunci: Object.keys(X) };
})()`);
console.log(JSON.stringify(r, null, 1));
await cdp.close();
