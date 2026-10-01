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

  const pos = v.state.doc.line(3).from;
  v.dispatch({
    changes: { from: pos, insert: '    sess' },
    selection: { anchor: pos + 8 },
    annotations: CPS.Transaction.userEvent.of('input.type'),
  });
  await wait(1500);

  /* Ctrl+Space is the explicit open; if the extension is mounted it must answer. */
  v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
    key: ' ', code: 'Space', ctrlKey: true, bubbles: true, cancelable: true,
  }));
  await wait(1500);

  out.tooltip = !!q('.cm-tooltip');
  out.ac = !!q('.cm-tooltip-autocomplete');
  const tt = q('.cm-tooltip');
  if (tt) {
    out.kelas = tt.className;
    out.item = [...tt.querySelectorAll('li')].slice(0, 8).map(e => e.textContent.trim());
  }
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ac2.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
