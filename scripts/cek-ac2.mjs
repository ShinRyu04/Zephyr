import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');

  // cek config autocompletion
  const AC = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012');
  out.adaModulAC = !!AC;
  out.adaFungsi = typeof AC.startCompletion;

  // coba startCompletion manual
  const pos = v.state.doc.line(3).from + 2;
  v.dispatch({ selection: { anchor: pos }, annotations: CPS.Transaction.userEvent.of('input.type') });
  await wait(400);
  if (AC.startCompletion) AC.startCompletion(v);
  await wait(1500);
  const ac = q('.cm-tooltip-autocomplete');
  out.acMuncul = !!ac;
  if (ac) {
    out.item = [...ac.querySelectorAll('li')].slice(0, 8).map(e => e.textContent.trim());
  }
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
