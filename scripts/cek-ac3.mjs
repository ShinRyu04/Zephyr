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
  const AC = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012');

  out.lang = v.state.facets ? 'ok' : '?';
  // ketik 'sess' di baris kosong (kata 'sessions' banyak di file ini)
  const line = 3;
  const pos = v.state.doc.line(line).from;
  v.dispatch({
    changes: { from: pos, insert: '    sess' },
    selection: { anchor: pos + 8 },
    annotations: CPS.Transaction.userEvent.of('input.type'),
  });
  await wait(2000);
  const ac = q('.cm-tooltip-autocomplete');
  out.acMuncul = !!ac;
  if (ac) {
    out.item = [...ac.querySelectorAll('li')].slice(0, 8).map(e => e.textContent.trim());
    out.acSize = Math.round(ac.getBoundingClientRect().width) + 'x' + Math.round(ac.getBoundingClientRect().height);
  }
  // cleanup
  v.dispatch({ changes: { from: pos, to: pos + 8, insert: '' }, annotations: CPS.Transaction.userEvent.of('delete') });
  await wait(300);
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
