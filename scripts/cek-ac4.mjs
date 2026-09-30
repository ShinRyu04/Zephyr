import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  // apakah extension autocompletion terpasang? cek facet
  const AC = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012');
  out.adaFacet = typeof AC.autocompletion;
  // cek config: completionConfig facet
  out.completionConfigAda = typeof AC.completionConfig;
  // cek startCompletion jalan
  out.startAda = typeof AC.startCompletion;
  // cek apakah view punya autocomplete aktif
  out.viewAdaAC = !!AC.currentCompletions;
  // trigger
  const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');
  const pos = v.state.doc.line(3).from;
  v.dispatch({ changes: { from: pos, insert: '    sess' }, selection: { anchor: pos + 8 }, annotations: CPS.Transaction.userEvent.of('input.type') });
  await wait(1200);
  AC.startCompletion(v);
  await wait(1500);
  out.act = !!q('.cm-tooltip');
  out.ac = !!q('.cm-tooltip-autocomplete');
  // apa yang muncul di tooltip?
  const tt = q('.cm-tooltip');
  if (tt) out.ttKelas = tt.className;
  v.dispatch({ changes: { from: pos, to: pos + 8, insert: '' } });
  await wait(300);
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
