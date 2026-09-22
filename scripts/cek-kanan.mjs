// cek-kanan.mjs — verifikasi AI panel benar-benar di KANAN.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

const set = await cdp.eval(`(() => {
  const S = window.__ZEPHYR__;
  const g = S?.getState?.().settings?.general ?? {};
  const T = window.__ZEPHYR_TERM__;
  if (T) {
    T.getState().setVisible(true);
    T.getState().setDock('ai');
  }
  return { aiPanel: g.aiPanel ?? '(default)', adaT: !!T };
})()`);

await new Promise((x) => setTimeout(x, 1000));

const dom = await cdp.eval(`(() => {
  const p = document.querySelector('[data-testid="ai-panel"]');
  if (!p) return { ada: false, bodyTeks: document.body.innerText.slice(0, 120) };
  const r = p.getBoundingClientRect();
  return {
    ada: true,
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.width),
    h: Math.round(r.height),
    winW: window.innerWidth,
    winH: window.innerHeight,
    diKanan: r.x > window.innerWidth * 0.5,
    kelasHost: p.parentElement?.className ?? '?',
  };
})()`);

console.log(JSON.stringify({ ...set, ...dom }, null, 1));
await cdp.close();
