import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const set = await cdp.eval(`(() => {
  const S = window.__ZEPHYR__;
  const g = S?.getState?.().settings?.general ?? {};
  const T = window.__ZEPHYR_TERM__;
  if (T) { T.getState().setVisible(true); T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai'); }
  return { aiPanel: g.aiPanel ?? '(default)' };
})()`);
await new Promise(x => setTimeout(x, 1000));
const dom = await cdp.eval(`(() => {
  const p = document.querySelector('[data-testid="ai-panel"]');
  if (!p) return { ada: false };
  const r = p.getBoundingClientRect();
  return {
    ada: true,
    x: Math.round(r.x), y: Math.round(r.y),
    w: Math.round(r.width), h: Math.round(r.height),
    winW: window.innerWidth, winH: window.innerHeight,
    diBawah: r.y > window.innerHeight * 0.5,
    kelasHost: p.parentElement?.className ?? '?',
  };
})()`);
console.log(JSON.stringify({ ...set, ...dom }, null, 1));
await cdp.close();
