import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const pos = v.state.doc.line(700).from + 2;
  v.dispatch({ selection: { anchor: pos } });
  await wait(300);

  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012');
  for (const b of v.state.facet(CV.keymap)) for (const kb of b) if (String(kb.key).includes('Alt-\\\\')) kb.run?.(v);

  await wait(4000);
  const g = q('.cm-ghost');
  out.ada = !!g;
  if (g) {
    out.teks = g.textContent.slice(0, 70);
    const cs = getComputedStyle(g);
    out.warna = cs.color;
    out.opacity = cs.opacity;
    out.italic = cs.fontStyle;
    out.garisBawah = cs.borderBottomStyle + ' ' + cs.borderBottomColor;
    const rc = g.getBoundingClientRect();
    out.posisi = Math.round(rc.left) + ',' + Math.round(rc.top) + ' ' + Math.round(rc.width) + 'x' + Math.round(rc.height);
  }
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ghost.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
