import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.tabSize = v.state.tabSize;
  out.charW = v.defaultCharacterWidth;
  out.step = v.defaultCharacterWidth * v.state.tabSize;

  // hitung manual: berapa baris yang punya depth > 0 dalam visible range?
  const depthOf = (text, ts) => {
    let kolom = 0;
    for (const ch of text) {
      if (ch === ' ') kolom += 1;
      else if (ch === '\t') kolom += ts - (kolom % ts);
      else return Math.floor(kolom / ts);
    }
    return -1;
  };
  const doc = v.state.doc;
  let n = 0, contoh = [];
  for (const {from, to} of v.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const d = depthOf(line.text, v.state.tabSize);
      if (d > 0) { n++; if (contoh.length < 3) contoh.push(line.number + ':' + d); }
      if (line.to + 1 > to) break;
      pos = line.to + 1;
    }
  }
  out.barisDepthPositif = n;
  out.contoh = contoh;
  out.visibleRanges = v.visibleRanges.map(r2 => r2.from + '-' + r2.to).join(', ');
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
