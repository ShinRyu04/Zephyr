import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  /* Names of every view plugin, to find the completion machinery. */
  out.namaPlugin = v.plugins.map((p) => p.constructor?.name || '(anon)');

  /* The completion state lives in a facet; check its value type across the
     known facet objects rather than one exported name. */
  const AC = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012');
  out.eksporAC = Object.keys(AC).join(',');

  /* Try the completion status field the module exposes. */
  if (AC.currentCompletions) {
    try { out.status = AC.currentCompletions(v.state); } catch (e) { out.statusErr = String(e).slice(0, 80); }
  }
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
