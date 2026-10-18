import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.runAsync(`return JSON.stringify((() => {
  const S = window.__ZEPHYR__.getState();
  const out = { activity: S.activity, sidebar: S.sidebarVisible };
  S.setSettingsOpen(false);
  S.setActivity('extensions');
  if (!S.sidebarVisible) S.toggleSidebar();
  out.sesudah = window.__ZEPHYR__.getState().activity;
  return out;
})())`);
console.log('store:', r);
await new Promise((r2) => setTimeout(r2, 2500));
const dom = await cdp.runAsync(`return JSON.stringify((() => ({
  xv: !!document.querySelector('[data-testid="extensions-view"]'),
  ai: !!document.querySelector('[data-testid="ai-view-tab-extensions"]'),
  testids: [...document.querySelectorAll('[data-testid^="ext"]')].slice(0, 8).map((e) => e.getAttribute('data-testid')),
  bodyClass: document.body.className,
}))())`);
console.log('dom:', dom);
process.exit(0);
