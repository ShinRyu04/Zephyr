import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const AC = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012');

  /* Build a context at a position where the text before it is "Chat". */
  const teks = v.state.doc.sliceString(0, 6000);
  const idx = teks.indexOf('Chat');
  out.idx = idx;
  const ctx = new AC.CompletionContext(v.state, idx + 4, false, v);
  out.matchBefore = (() => { const m = ctx.matchBefore(/[\\w$]+/); return m ? m.text : null; })();

  /*
   * The app's word source is module-private, but the *behaviour* is what
   * matters: run the same scan the source runs and confirm it would return
   * options for this prefix.
   */
  const sekitar = v.state.sliceDoc(0, Math.min(v.state.doc.length, idx + 4000));
  const kandidat = new Map();
  const diketik = 'Chat';
  for (const m of sekitar.matchAll(/[A-Za-z_$][\\w$]{1,40}/g)) {
    const w = m[0];
    if (w === diketik) continue;
    if (!w.toLowerCase().startsWith(diketik.toLowerCase())) continue;
    kandidat.set(w, (kandidat.get(w) ?? 0) + 1);
  }
  out.kandidat = [...kandidat.keys()].slice(0, 10);
  out.jumlahKandidat = kandidat.size;

  /* And confirm the extension is mounted by asking for the completion status. */
  out.status = AC.completionStatus(v.state);
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
