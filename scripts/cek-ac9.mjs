import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const AC = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012');
  const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');

  out.fokusSebelum = v.hasFocus;
  v.focus();
  out.fokusSesudah = v.hasFocus;

  /* Put real text under the cursor with a word that exists elsewhere. */
  const pos = v.state.doc.line(3).from;
  v.dispatch({
    changes: { from: pos, insert: '    sess' },
    selection: { anchor: pos + 8 },
    annotations: CPS.Transaction.userEvent.of('input.type'),
  });
  await wait(1200);
  out.statusKetik = AC.currentCompletions(v.state).map((c) => c.label).slice(0, 6);

  AC.startCompletion(v);
  await wait(1500);
  out.statusExplicit = AC.currentCompletions(v.state).map((c) => c.label).slice(0, 6);
  out.tooltip = !!q('.cm-tooltip-autocomplete');

  v.dispatch({ changes: { from: pos, to: pos + 8, insert: '' }, annotations: CPS.Transaction.userEvent.of('delete') });
  await wait(300);
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
