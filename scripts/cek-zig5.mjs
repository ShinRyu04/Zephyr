import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.tabAktif = v.state.doc.lines;
  out.zigAwal = document.querySelectorAll('.cm-zig').length;
  out.charW = v.defaultCharacterWidth;

  // panggil measure ulang
  v.requestMeasure();
  await wait(900);
  out.zigSetelahMeasure = document.querySelectorAll('.cm-zig').length;
  out.charW2 = v.defaultCharacterWidth;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
