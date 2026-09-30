import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  /* Point at a real line so the suggestion has context, then run the keymap. */
  const pos = v.state.doc.line(700).from + 2;
  v.dispatch({ selection: { anchor: pos } });
  await wait(300);

  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012');
  const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');
  const key = CV.keymap;
  const bindings = v.state.facet(key);
  out.jumlahKeymap = bindings.length;

  /* Drive the Alt-\\ binding the same way CodeMirror would. */
  let ran = null;
  for (const b of bindings) {
    for (const kb of b) {
      if (kb.key === 'Alt-\\\\' && !kb.shift && !kb.run) continue;
      if (String(kb.key).includes('Alt-\\\\')) {
        ran = kb.run ? kb.run(v) : 'no-run';
      }
    }
  }
  out.altBackslash = String(ran);
  await wait(3500);
  const g = q('.cm-ghost');
  out.ghostMuncul = !!g;
  if (g) { out.teks = g.textContent.slice(0, 80); out.warna = getComputedStyle(g).color; }

  /* Also check the debug log the AI store keeps. */
  const dbg = window.__ZEPHYR_AI__ ? window.__ZEPHYR_AI__.store.getState() : null;
  out.err = (window.__ZEPHYR_ERRORS__ || []).slice(-3).map(e => String(e.msg || e).slice(0, 140));
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
