import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  out.ghostSetting = st.settings.editor.ghostText;
  // cek apakah Ada CSS cm-ghost
  out.ghostCss = !!document.querySelector('style') ? 'ada style tag' : null;
  // cek extension ghost terpasang: cari state field
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.plugins = v.plugins.length;
  // hitung state field
  out.fields = v.state.config ? 'ada' : 'tidak';
  // test manual: panggil setGhost via import
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
