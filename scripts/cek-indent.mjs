import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.adaView = !!v;
  out.defaultCharW = v.defaultCharacterWidth;
  out.tabSize = v.state.tabSize;
  out.step = v.defaultCharacterWidth * v.state.tabSize;
  out.visibleRanges = v.visibleRanges.length;
  out.firstRange = v.visibleRanges[0] ? v.visibleRanges[0].from + '-' + v.visibleRanges[0].to : null;

  // baris pertama yang punya indent
  let contoh = null;
  for (let n = 1; n <= Math.min(40, v.state.doc.lines); n++) {
    const t = v.state.doc.line(n).text;
    const sp = t.length - t.trimStart().length;
    if (sp > 0) { contoh = { n, sp, teks: t.slice(0, 30) }; break; }
  }
  out.contohIndent = contoh;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
