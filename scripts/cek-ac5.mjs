import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const mod = await import('/src/lib/lspCm.ts');
  out.adaFungsi = typeof mod.autocompletionZephyr;
  try {
    const ext = mod.autocompletionZephyr('D:/Zephyr/src/lib/aiStore.ts', () => 'typescript', false);
    out.tipe = typeof ext;
    out.isArray = Array.isArray(ext) ? ext.length : 'bukan array';
    const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');
    out.adaAppend = typeof CPS.StateEffect.appendConfig;
  } catch (e) {
    out.err = String(e).slice(0, 200);
  }

  /* Cek facet autocompletion benar-benar terpasang di view. */
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const AC = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012');
  const FACET = AC.autocompletionConfig ?? null;
  out.facetNama = FACET ? 'ada' : 'tidak';
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
