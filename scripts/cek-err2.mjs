import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  out.errCount = window.__ZEPHYR_ERRORS__ ? window.__ZEPHYR_ERRORS__.length : null;
  out.err = (window.__ZEPHYR_ERRORS__ || []).slice(-6).map(e => String(e.msg || e.message || e).slice(0, 160));
  return out;
`, 60000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
