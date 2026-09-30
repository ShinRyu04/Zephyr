import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  out.viteErr = !!q('#vite-error-overlay');

  // N1: sidebar bisa scroll?
  const sb = q('.sidebar');
  if (sb) {
    const cs = getComputedStyle(sb);
    out.overflowY = cs.overflowY;
    out.bisaScroll = sb.scrollHeight > sb.clientHeight;
  }

  // 0D3: tombol mic ada?
  window.__ZEPHYR_TERM__.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.focusTab('ai');
  await wait(1400);
  const mic = q('[data-testid="ai-mic"]');
  out.micAda = !!mic;
  if (mic) {
    out.micTitle = mic.getAttribute('title');
    out.micPushed = mic.getAttribute('aria-pressed');
  }
  const plus = q('[data-testid="ai-plus"]');
  out.plusAda = !!plus;

  // N3: gutter punya minWidth?
  const gut = q('.cm-gutters');
  out.gutterAda = !!gut;
  if (gut) {
    const g = getComputedStyle(gut);
    out.gutterMinWidth = g.minWidth;
    out.gutterLeBAR = Math.round(gut.getBoundingClientRect().width);
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
