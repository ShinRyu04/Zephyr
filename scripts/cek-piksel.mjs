import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  // paksa draw ulang minimap: scroll sedikit
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.viewAda = !!v;
  if (v) {
    v.dispatch({ selection: { anchor: 500 } });
    await wait(1200);
  }
  const cv = q('[data-testid="minimap-canvas"]');
  if (!cv) return out;
  out.size = cv.width + 'x' + cv.height;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const ctx = c2.getContext('2d');
  ctx.drawImage(cv, 0, 0);
  // ambil SEMUA piksel yg alpha > 200 (bukan antialias)
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const map = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i+3] < 200) continue;
    const k = d[i] + ',' + d[i+1] + ',' + d[i+2];
    map.set(k, (map.get(k) || 0) + 1);
  }
  const top = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10);
  out.warnaDominan = top.map(([k,v2]) => k + ' x' + v2);
  out.totalWarna = map.size;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
