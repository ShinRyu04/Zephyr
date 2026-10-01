import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // paksa tambahkan plugin indent manual untuk lihat apakah build() jalan
  const mod = await import('/src/lib/cmIndent.ts');
  out.modulAda = !!mod;
  out.eksporIndent = typeof mod.indentGuides;
  out.eksporBracket = typeof mod.bracketPairColors;
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  // tambahkan plugin ke view yang hidup
  try {
    const ext = mod.indentGuides();
    out.extTipe = typeof ext;
    // cek apakah extension punya .extension (array)
    out.extArr = Array.isArray(ext) ? ext.length : 'bukan array';
    // coba dispatch append
    const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012').catch(() => null);
    out.cpsAda = !!CPS;
    if (CPS) {
      const eff = CPS.StateEffect.appendConfig.of([ext]);
      v.dispatch({ effects: eff });
      await wait(800);
      out.zigSetelahAppend = document.querySelectorAll('.cm-zig').length;
    }
  } catch (e) { out.err = String(e).slice(0, 120); }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
