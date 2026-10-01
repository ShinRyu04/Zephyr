// cek-panel.mjs — diagnosa: kenapa panel AI tidak ter-render.
import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.eval(`(() => {
  const P = window.__ZEPHYR_PANEL__;
  const S = window.__ZEPHYR__;
  const q = (s) => document.querySelector(s);
  const sebelum = {
    activeTab: P?.activeTab?.() ?? '?',
    visibleTabs: P?.visibleTabs?.() ?? '?',
    visible: P?.visible?.() ?? '?',
    panelAIAda: !!q('[data-testid="ai-panel"]'),
  };
  if (P) P.focusTab('ai');
  return {
    sebelum,
    sesudahActiveTab: P?.activeTab?.() ?? '?',
    sesudahVisible: P?.visible?.() ?? '?',
    sesudahPanelAI: !!q('[data-testid="ai-panel"]'),
    sesudahEffort: !!q('[data-testid="ai-effort"]'),
  };
})()`);
console.log(JSON.stringify(r, null, 1));
await new Promise(x => setTimeout(x, 800));
const r2 = await cdp.eval(`(() => ({
  panelAIAda: !!document.querySelector('[data-testid="ai-panel"]'),
  effortAda: !!document.querySelector('[data-testid="ai-effort"]'),
  headHTML: document.querySelector('.ai-head')?.innerHTML?.slice(0, 300) ?? 'tidak ada .ai-head',
}))()`);
console.log(JSON.stringify(r2, null, 1));
await cdp.close();
