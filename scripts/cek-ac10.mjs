import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');

  /* Find a word that exists in the document, then ask the completion source
     for suggestions as if the user had typed its first characters. */
  const teks = v.state.doc.sliceString(0, 6000);
  const kata = [...new Set(teks.match(/[A-Za-z_$][\\w$]{4,}/g) || [])].find((w) => /session/i.test(w));
  out.kataUji = kata;

  const pos = v.state.doc.line(3).from;
  const diketik = (kata || 'sess').slice(0, 4);
  v.dispatch({
    changes: { from: pos, insert: '    ' + diketik },
    selection: { anchor: pos + 4 + diketik.length },
    annotations: CPS.Transaction.userEvent.of('input.type'),
  });
  await wait(600);

  const AC = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012');
  const ctx = new AC.CompletionContext(v.state, pos + 4 + diketik.length, false, v);
  out.cursor = ctx.pos;
  out.matchBefore = (() => {
    const m = ctx.matchBefore(/[\\w$]+/);
    return m ? { from: m.from, text: m.text } : null;
  })();

  /* Call the source the app installs and see whether it answers. */
  const lspCm = await import('/src/lib/lspCm.ts');
  try {
    const hasil = await lspCm.snippetCompletionSource('D:/Zephyr/src/lib/aiStore.ts', () => 'typescript')(ctx);
    out.snippetJawab = hasil ? hasil.options.length : null;
  } catch (e) { out.snippetErr = String(e).slice(0, 120); }

  v.dispatch({ changes: { from: pos, to: pos + 4 + diketik.length, insert: '' }, annotations: CPS.Transaction.userEvent.of('delete') });
  await wait(300);
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
