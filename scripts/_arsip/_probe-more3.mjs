/* Sekali pakai: (a) apakah panel muncul saat buka=true, (b) menu ... terbuka? */
import { Cdp, sleep } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr', 'localhost']);

const a = await cdp.json(`return JSON.stringify(await (async () => {
  const tg = await import('/src/lib/toolGate.ts');
  tg.useToolGate.getState().setBuka(true);
  await new Promise((r) => setTimeout(r, 400));
  const out = {
    buka: tg.useToolGate.getState().buka,
    toolgate: !!document.querySelector('[data-testid="toolgate"]'),
    scrim: !!document.querySelector('[data-testid="toolgate-scrim"]'),
    aiHost: !!document.querySelector('[data-testid="ai-host"]'),
    tabChat: !!document.querySelector('[data-testid="ai-host-tab-chat"]'),
    hostTeks: (document.querySelector('[data-testid="ai-host"]') || {}).className || null,
    semuaTestid: [...new Set([...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))].filter((t) => /tool|gate/i.test(t)),
  };
  tg.useToolGate.getState().setBuka(false);
  return out;
})())`);
console.log('A', JSON.stringify(a, null, 1));

const b = await cdp.json(`return JSON.stringify((() => {
  const m = document.querySelector('[data-testid="ai-more"]');
  m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  m.click();
  return { tag: m.tagName, cls: m.className };
})())`);
await sleep(500);
const c = await cdp.json(`return JSON.stringify({
  menuItem: document.querySelectorAll('[role="menuitem"]').length,
  testidMenu: [...new Set([...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))].filter((t) => /more|menu|toolset/i.test(t)),
  teksMenu: [...document.querySelectorAll('[role="menuitem"]')].map((e) => String(e.textContent || '').trim()).slice(0, 20),
})`);
console.log('B', JSON.stringify(b), 'C', JSON.stringify(c, null, 1));
await cdp.close();
