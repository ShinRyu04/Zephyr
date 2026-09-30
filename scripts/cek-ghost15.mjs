import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');

  /* Start a fresh line with a partial statement, the way a person would. */
  const baris = 703;
  const pos = v.state.doc.line(baris).from;
  v.dispatch({
    changes: { from: pos, insert: '    const total = ' },
    selection: { anchor: pos + 18 },
    annotations: CPS.Transaction.userEvent.of('input.type'),
  });

  await wait(3500);
  const g = q('.cm-ghost');
  out.ada = !!g;
  if (g) {
    out.teks = g.textContent.slice(0, 70);
    const cs = getComputedStyle(g);
    out.warna = cs.color;
    out.opacity = cs.opacity;
    out.italic = cs.fontStyle;
    out.garisBawah = cs.borderBottomStyle + ' / ' + cs.borderBottomColor;
  }
  /* Leave the text so the screenshot shows it; the harness undoes nothing. */
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ghost.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
