import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  const cur = JSON.parse(JSON.stringify(st.settings.editor));
  cur.ghostText = true;
  await st.applySettings({ editor: cur });
  await wait(2000);
  const st2 = window.__ZEPHYR__.getState();
  out.ghostSekarang = st2.settings.editor.ghostText;

  // test render ghost widget langsung
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.adaView = !!v;
  // tulis sesuatu di baris yang punya indent supaya trigger
  const pos = v.state.doc.line(700).from + 2;
  v.dispatch({ selection: { anchor: pos } });
  await wait(500);

  // cek state field ghost
  out.ghostFieldAda = false;
  try {
    const mod = await import('/src/lib/ghostText.ts');
    out.modulAda = !!mod.ghostText;
    out.ekspor = Object.keys(mod).join(',');
  } catch (e) { out.err = String(e).slice(0, 100); }
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
