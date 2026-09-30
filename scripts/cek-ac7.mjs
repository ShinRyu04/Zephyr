import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};

  /* Is the keymap that opens completion even installed? */
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012');

  const keys = [];
  for (const b of v.state.facet(CV.keymap)) {
    for (const kb of b) keys.push(kb.key);
  }
  out.keymaps = keys.slice(0, 40);
  out.adaCtrlSpace = keys.some((k) => /Ctrl-Space|Mod-Space/i.test(k));
  out.adaTab = keys.some((k) => k === 'Tab');

  /* Extension presence: does the editor's own extension list contain the
     autocompletion config? Count compartments and check for the tooltip
     plugin class marker on the view. */
  out.plugins = v.plugins.length;
  out.adaTooltipPlugin = v.plugins.some((p) => /tooltip/i.test(p.constructor?.name || ''));
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
