import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.docLen = v.state.doc.length;
  out.totalBaris = v.state.doc.lines;
  const host = q('[data-testid="minimap"]');
  out.tinggiHost = Math.round(host.getBoundingClientRect().height);
  const cv = q('[data-testid="minimap-canvas"]');
  out.canvasH = cv.height;

  // hitung ulang seperti kode
  const LANGKAH_MIN = 1.1;
  const MAX_BARIS = 12000;
  const tk = out.totalBaris;
  const th = out.tinggiHost;
  const langkah = Math.max(1, Math.min(Math.ceil(tk / MAX_BARIS), Math.ceil(tk / Math.max(1, Math.floor(th / LANGKAH_MIN)))));
  const barisTampil = Math.ceil(tk / langkah);
  const skala = Math.min(3, Math.max(th / Math.max(barisTampil, 1), 1));
  out.langkah = langkah;
  out.barisTampil = barisTampil;
  out.skala = skala;
  out.totalPx = Math.round(barisTampil * skala);
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
