import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  // SCROLL beneran ke baris 700
  v.scrollDOM.scrollTop = v.lineBlockAt(v.state.doc.line(700).from).top;
  await wait(2000);
  out.scrollTop = Math.round(v.scrollDOM.scrollTop);
  out.barisTerlihat = v.state.doc.lineAt(v.visibleRanges[0].from).number;
  const z = qa('.cm-zbr');
  out.jumlah = z.length;
  const kelas = {};
  z.forEach(e => {
    const c = e.className.split(' ').find(x => x.startsWith('cm-zbr-'));
    kelas[c] = (kelas[c] || 0) + 1;
  });
  out.perKelas = kelas;
  out.warna = [...new Set(z.map(e => getComputedStyle(e).color))];
  out.zig = qa('.cm-zig').length;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-bracket2.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
