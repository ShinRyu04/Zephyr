import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  // sisipkan teks seperti user ngetik
  const pos = v.state.doc.line(700).from;
  v.dispatch({
    changes: { from: pos, insert: '  const ' },
    selection: { anchor: pos + 8 },
    annotations: [],
  });
  out.setelahKetik = document.querySelectorAll('.cm-ghost').length;
  // tunggu debounce 700ms + request AI
  await wait(2500);
  const g = q('.cm-ghost');
  out.ghostMuncul = !!g;
  if (g) {
    out.teks = g.textContent.slice(0, 60);
    out.warna = getComputedStyle(g).color;
    out.garisBawah = getComputedStyle(g).borderBottomStyle;
  }
  // undo
  v.dispatch({ changes: { from: pos, to: pos + 8, insert: '' } });
  await wait(400);
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
