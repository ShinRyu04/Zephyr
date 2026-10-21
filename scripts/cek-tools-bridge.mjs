// Diagnosa V7 fase 06: skema tool `browser` gabungan.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
const r = await cdp.eval(`JSON.stringify(window.__ZEPHYR_TOOLS__.spec('browser'), null, 1)`);
console.log(r);
await cdp.close();
