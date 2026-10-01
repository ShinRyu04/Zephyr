import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  /*
   * Capture every ai-chunk the backend emits while the ghost request runs, so
   * we can tell "no reply" apart from "reply arrived but the widget never
   * mounted".
   */
  window.__UJI_CHUNKS__ = [];
  const EVT = await import('/node_modules/@tauri-apps/api/event.js').catch(() => null);
  out.bisaImportEvent = !!EVT;
  if (EVT) {
    await EVT.listen('ai-chunk', (ev) => {
      window.__UJI_CHUNKS__.push({ id: ev.payload.id, len: (ev.payload.text || '').length, err: ev.payload.err || null, done: !!ev.payload.done });
    });
  }

  const pos = v.state.doc.line(700).from + 2;
  v.dispatch({ selection: { anchor: pos } });
  await wait(300);

  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012');
  const bindings = v.state.facet(CV.keymap);
  let ran = null;
  for (const b of bindings) for (const kb of b) if (String(kb.key).includes('Alt-\\\\')) ran = kb.run ? kb.run(v) : 'no-run';
  out.altBackslash = String(ran);

  await wait(4000);
  out.chunks = window.__UJI_CHUNKS__;
  out.ghost = !!q('.cm-ghost');
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
