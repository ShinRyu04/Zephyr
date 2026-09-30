import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const src = await fetch('/src/lib/cmIndent.ts').then(r2 => r2.text());
  out.punyaIndentGuides = src.includes('export const indentGuides');
  out.punyaBracket = src.includes('export const bracketPairColors');

  // hitung manual depthOf untuk baris 37
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const doc = v.state.doc;
  const tabSize = v.state.tabSize;
  out.tabSize = tabSize;
  const teks37 = doc.line(37).text;
  out.teks37 = JSON.stringify(teks37.slice(0, 20));
  let kolom = 0;
  for (const ch of teks37) {
    if (ch === ' ') kolom += 1;
    else if (ch === '\t') kolom += tabSize - (kolom % tabSize);
    else break;
  }
  out.kolom = kolom;
  out.depth = Math.floor(kolom / tabSize);

  // cek: apakah ada plugin dengan dekorasi line?
  out.pluginCount = v.plugins.length;
  // cari dekorasi yang punya class cm-zig
  let adaZig = 0;
  for (const p of v.plugins) {
    const d = p.decorations;
    if (!d) continue;
    try {
      d.between(0, v.state.doc.length, (f, t, val) => {
        if (val && val.spec && val.spec.class && String(val.spec.class).includes('cm-zig')) adaZig++;
      });
    } catch (e) {}
  }
  out.dekorasiZig = adaZig;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
