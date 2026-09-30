import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
console.log('  page:', page.title);
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const BS = String.fromCharCode(92);
  out.bridges = Object.keys(window).filter(k => k.startsWith('__ZEPHYR')).length;
  out.viteErr = !!q('#vite-error-overlay');

  window.__ZEPHYR__.getState().openWorkspace('D:' + BS + 'Zephyr');
  await wait(3500);
  out.ws = window.__ZEPHYR__.getState().workspace;

  const st = window.__ZEPHYR__.getState();
  out.adaOpenPathAt = typeof st.openPathAt;
  out.adaOpenPath = typeof st.openPath;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
