import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  return window.__ZEPHYR_TERM__.getState().agents;
`, 20000);
console.log(JSON.stringify(r, null, 2));
cdp.close();
