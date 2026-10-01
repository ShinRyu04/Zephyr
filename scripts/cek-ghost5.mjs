import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');

  const pos = v.state.doc.line(700).from;
  v.dispatch({
    changes: { from: pos, insert: '  const ' },
    selection: { anchor: pos + 8 },
    annotations: CPS.Transaction.userEvent.of('input.type'),
  });
  out.setelahKetik = document.querySelectorAll('.cm-ghost').length;
  await wait(2200);
  const g = q('.cm-ghost');
  out.ghostMuncul = !!g;
  if (g) {
    out.teks = g.textContent.slice(0, 80);
    out.warna = getComputedStyle(g).color;
    out.border = getComputedStyle(g).borderBottomStyle;
  }
  // cleanup
  v.dispatch({ changes: { from: pos, to: pos + 8, insert: '' }, annotations: CPS.Transaction.userEvent.of('delete') });
  await wait(300);
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
