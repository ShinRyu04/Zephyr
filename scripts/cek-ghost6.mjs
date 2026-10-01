import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // apakah setting ghost benar-benar jadi extension? cek via settings yang dibaca komponen
  const st = window.__ZEPHYR__.getState();
  out.ghostSetting = st.settings.editor.ghostText;

  // cek ada API key?
  const A = window.__ZEPHYR_AI__.store.getState();
  out.provider = A.provider;
  out.model = A.model;
  out.adaKey = A.keys.some(k => k.provider === A.provider && k.hasKey);
  out.keys = A.keys.map(k => k.provider + ':' + k.hasKey);

  // cek error log
  out.err = (window.__ZEPHYR_ERRORS__ || []).slice(-4).map(e => String(e.msg || e).slice(0, 120));

  // cek aiDebug log
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
