/* Sekali pakai: uji jalur buka tool gate lewat tombol, dengan jeda antar klik. */
import { Cdp, sleep } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr', 'localhost']);

const klik1 = await cdp.json(`return JSON.stringify((() => {
  const m = document.querySelector('[data-testid="ai-more"]');
  if (!m) return { ok: false };
  m.click();
  return { ok: true };
})())`);
await sleep(400);
const menu = await cdp.json(`return JSON.stringify({
  adaMenu: !!document.querySelector('[data-testid="ai-more-menu"]'),
  adaItem: !!document.querySelector('[data-testid="ai-open-toolsets"]'),
  itemTeks: (document.querySelector('[data-testid="ai-open-toolsets"]') || {}).textContent || null,
})`);
console.log('klik1', JSON.stringify(klik1), 'menu', JSON.stringify(menu));
const klik2 = await cdp.json(`return JSON.stringify((() => {
  const it = document.querySelector('[data-testid="ai-open-toolsets"]');
  if (!it) return { ok: false };
  it.click();
  return { ok: true };
})())`);
await sleep(600);
const st = await cdp.json(`return JSON.stringify({
  toolgate: !!document.querySelector('[data-testid="toolgate"]'),
  awas: !!document.querySelector('[data-testid="toolgate-all-on-awas"]'),
  total: (document.querySelector('[data-testid="toolgate-total"]') || {}).textContent || null,
})`);
console.log('klik2', JSON.stringify(klik2), 'panel', JSON.stringify(st));

/* Apakah import langsung dari skrip ini = instance store yang dipakai app? */
const inst = await cdp.json(`return JSON.stringify(await (async () => {
  const tg = await import('/src/lib/toolGate.ts');
  const s = tg.useToolGate.getState();
  const sebelum = s.buka;
  tg.useToolGate.getState().setBuka(!sebelum);
  await new Promise((r) => setTimeout(r, 200));
  const panel = !!document.querySelector('[data-testid="toolgate"]');
  tg.useToolGate.getState().setBuka(sebelum);
  return { sebelum, panelSesudahToggle: panel };
})())`);
console.log('instance', JSON.stringify(inst));
await cdp.close();
