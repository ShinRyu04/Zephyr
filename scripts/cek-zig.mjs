import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  if (!v) return out;

  // cari facet indentGuides — apakah extension-nya terpasang?
  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012').catch(() => null);
  out.viewModul = !!CV;

  // cek plugin yang aktif: ada ViewPlugin dengan dekorasi?
  const plugin = v.plugins ? v.plugins.length : null;
  out.jumlahPlugin = plugin;

  // cari class cm-zig di SELURUH dokumen (bukan hanya viewport)
  out.zigGlobal = document.querySelectorAll('.cm-zig').length;
  out.zbrGlobal = document.querySelectorAll('.cm-zbr').length;

  // apakah ada garis indent lewat ::before? cek computed
  const line = q('.cm-line');
  if (line) {
    const cs = getComputedStyle(line);
    out.lineBgImage = cs.backgroundImage.slice(0, 60);
    out.lineBgSize = cs.backgroundSize;
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
