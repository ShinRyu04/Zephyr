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
  const ACM = await import('/node_modules/.vite/deps/@codemirror_autocomplete.js?v=d1ad1012').catch(() => null);
  out.modulAda = !!ACM;

  // buka baris kosong lalu ketik 'con' untuk trigger
  const pos = v.state.doc.line(1).from;
  v.dispatch({ changes: { from: pos, insert: 'con' }, selection: { anchor: pos + 3 }, annotations: CPS.Transaction.userEvent.of('input.type') });
  await wait(2500);
  const ac = q('.cm-tooltip-autocomplete');
  out.acMuncul = !!ac;
  if (ac) {
    out.item = [...ac.querySelectorAll('li')].slice(0, 6).map(e => e.textContent.trim());
    const rc = ac.getBoundingClientRect();
    out.pos = Math.round(rc.left) + ',' + Math.round(rc.top) + ' ' + Math.round(rc.width) + 'x' + Math.round(rc.height);
    out.menutupi = (() => {
      const el = document.elementFromPoint(rc.left + 10, rc.top + 10);
      return !(el && ac.contains(el));
    })();
  }
  // cleanup
  v.dispatch({ changes: { from: pos, to: pos + 3, insert: '' } });
  await wait(300);
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-ac.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
