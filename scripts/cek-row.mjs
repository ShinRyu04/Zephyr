import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  out.viteErr = !!q('#vite-error-overlay');
  window.__ZEPHYR__.getState().setActivity('ai');
  await wait(1200);
  const btn = q('[data-testid="ai-new-chat"]');
  if (btn) {
    const cs = getComputedStyle(btn);
    out.arah = cs.flexDirection;
    // ikon & teks sejajar horizontal? bandingkan center Y
    const svg = btn.querySelector('svg');
    const sp = btn.querySelector('span') || btn.lastChild;
    if (svg && sp && sp.getBoundingClientRect) {
      const a = svg.getBoundingClientRect(), b = sp.getBoundingClientRect();
      out.sejajar = Math.abs((a.top + a.height/2) - (b.top + b.height/2)) < 3;
    }
  }
  const row = q('[data-testid^="ai-side-baris-"], .ai-side-item');
  out.itemAda = !!row;
  const b = q('.ai-side-list .ai-side-btn');
  if (b) out.rowArah = getComputedStyle(b).flexDirection;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
