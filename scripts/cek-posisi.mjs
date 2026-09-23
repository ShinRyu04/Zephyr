import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const T = window.__ZEPHYR_TERM__;
  const g = S.getState().settings.general;
  // Pastikan tidak maximized, lalu buka panel AI.
  if (T.getState().maximized) T.getState().toggleMaximized();
  T.getState().setVisible(true);
  T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise(r => setTimeout(r, 900));
  const p = document.querySelector('[data-testid="ai-panel"]');
  const rr = p?.getBoundingClientRect();
  const area = document.querySelector('.panel-area')?.getBoundingClientRect();
  return {
    aiPanel: g.aiPanel,
    maximized: T.getState().maximized,
    panelAI: rr ? { x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height) } : null,
    areaPanel: area ? { x: Math.round(area.x), y: Math.round(area.y), w: Math.round(area.width), h: Math.round(area.height) } : null,
    winH: window.innerHeight,
  };
})())`);
console.log(JSON.stringify(r, null, 1));
await cdp.close();
