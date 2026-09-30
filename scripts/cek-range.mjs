import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.scrollTop = v.scrollDOM.scrollTop;
  out.visibleRanges = v.visibleRanges.map(r2 => r2.from + '-' + r2.to).join(' | ');
  out.rangeAtas = v.visibleRanges[0] ? v.visibleRanges[0].from : null;
  out.barisPertamaTerlihat = v.state.doc.lineAt(v.visibleRanges[0].from).number;
  // apa yang akan ditampilkan kalau range 0-1160?
  const z = qa('.cm-zbr');
  out.posisiKurung = z.slice(0, 5).map(e => {
    const p = e.getBoundingClientRect();
    return Math.round(p.left) + ',' + Math.round(p.top);
  });
  // cek apakah kurung itu di baris mana
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
