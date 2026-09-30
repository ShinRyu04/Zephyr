import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const mm = await import('/src/components/editor/Minimap.tsx').catch(() => null);
  out.modulAda = !!mm;
  out.debug = mm ? mm.minimapDebug : null;

  // ukuran host + canvas
  const host = q('[data-testid="minimap"]');
  const cv = q('[data-testid="minimap-canvas"]');
  if (host) {
    const hr = host.getBoundingClientRect();
    out.host = Math.round(hr.width) + 'x' + Math.round(hr.height);
  }
  if (cv) {
    out.canvasAttr = cv.width + 'x' + cv.height;
    const cr = cv.getBoundingClientRect();
    out.canvasCss = Math.round(cr.width) + 'x' + Math.round(cr.height);
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
