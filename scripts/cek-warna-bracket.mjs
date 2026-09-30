import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  // ke tengah file yang banyak indent
  v.dispatch({ selection: { anchor: v.state.doc.line(700).from } });
  await wait(1800);
  const z = qa('.cm-zbr');
  out.jumlah = z.length;
  out.warna = [...new Set(z.map(e => getComputedStyle(e).color))];
  out.perKelas = {};
  for (let i = 0; i < 6; i++) {
    const el = q('.cm-zbr-' + i);
    if (el) out.perKelas['zbr-' + i] = getComputedStyle(el).color;
  }
  out.zig = qa('.cm-zig').length;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-bracket.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
