import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // paksa panggil manual: apakah gambar() jalan kalau dipanggil langsung?
  const mod = await import('/src/components/editor/Minimap.tsx');
  out.sebelum = Object.assign({}, mod.minimapDebug);

  // paksa scroll supaya scroll listener trigger perbaruiViewport (bukan gambar)
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  if (v) { v.scrollDOM.scrollTop = 200; await wait(800); v.scrollDOM.scrollTop = 0; await wait(800); }
  out.sesudahScroll = Object.assign({}, mod.minimapDebug);

  // paksa resize observer trigger
  const host = q('[data-testid="minimap"]');
  if (host) { host.style.height = '514px'; await wait(300); host.style.height = ''; await wait(800); }
  out.sesudahResize = Object.assign({}, mod.minimapDebug);
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
