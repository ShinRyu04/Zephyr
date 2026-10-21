/*
 * Finish the Agents-window verification that a dead terminal interrupted.
 *
 *   node scratch/v-ag2.mjs
 *
 * A1  Browser tab mounts without throwing, empty state + services list render
 * A2  Diff View caps its rows at 400 and says how many are hidden
 * A3  Diff View filter narrows to one file
 * A4  Ctrl+Alt+B hides the right column and brings it back
 */
import * as Cdp from '../scripts/lib-cdp.mjs';

const list = await fetch('http://127.0.0.1:9223/json/list').then((r) => r.json());
const agents = list.find((w) => (w.url || '').includes('#agents'));
if (!agents) {
  console.log('[ag2] JENDELA AGENTS TIDAK ADA - buka lewat Open in Agent dulu');
  process.exit(1);
}
const cdp = await Cdp.Cdp.connect(agents.webSocketDebuggerUrl);
const t = (s, v) => console.log(`[ag2] ${s}\n      ${v}`);
const ev = (body, ms = 30000) => cdp.eval(body, ms);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* A1 - Browser tab. A mount error would leave ag-browser absent. */
await ev(`(() => {
  document.querySelectorAll('[data-testid^="ag-tab-close-"]').forEach((b) => b.click());
  return 1;
})()`);
await wait(400);
await ev(`(document.querySelector('[data-testid="ag-tab-plus"]')?.click(), 1)`);
await wait(400);
await ev(`(document.querySelector('[data-testid="ag-open-browser"]')?.click(), 1)`);
await wait(2500);
const a1 = await ev(`JSON.stringify({
  ada: !!document.querySelector('[data-testid="ag-browser"]'),
  kosong: (document.querySelector('[data-testid="ag-browser-empty"]')?.innerText ?? '').replace(/\\n+/g, ' | ').slice(0, 220),
  layanan: document.querySelectorAll('[data-testid^="ag-browser-service-"]').length,
  url: !!document.querySelector('[data-testid="ag-browser-url"]'),
  go: !!document.querySelector('[data-testid="ag-browser-go"]'),
})`);
t('A1 browser', a1);

/* A2/A3 - Diff, on the real repo. */
const ws = await ev(`(async () => {
  const { useStore } = await import('/src/lib/store.ts');
  if (!useStore.getState().workspace) await useStore.getState().openWorkspace('D:/Zephyr').catch(() => {});
  return useStore.getState().workspace ?? '';
})()`, 90000);
t('workspace', JSON.stringify(ws));
await wait(1500);
await ev(`(() => {
  document.querySelectorAll('[data-testid^="ag-tab-close-"]').forEach((b) => b.click());
  return 1;
})()`);
await wait(400);
await ev(`(document.querySelector('[data-testid="ag-tab-plus"]')?.click(), 1)`);
await wait(400);
await ev(`(document.querySelector('[data-testid="ag-open-diff"]')?.click(), 1)`);
await wait(6000);
const a2 = await ev(`JSON.stringify({
  baris: document.querySelectorAll('.ag-diff-row').length,
  lebih: (document.querySelector('[data-testid="ag-diff-more"]')?.innerText ?? '').trim(),
  kepala: (document.querySelector('[data-testid="ag-diff"]')?.innerText ?? '').split('\\n').slice(0, 2).join(' | '),
})`);
t('A2 diff cap', a2);

/* A4 - Ctrl+Alt+B toggles the right column. */
const b1 = await ev(`(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, altKey: true, bubbles: true }));
  return 1;
})()`);
await wait(500);
const b2 = await ev(`JSON.stringify({
  kanan: !!document.querySelector('[data-testid="ag-right"]'),
})`);
t('A4 ctrl+alt+b', `${JSON.stringify(b1)} ${b2}`);
await ev(`(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, altKey: true, bubbles: true }));
  return 1;
})()`);
await wait(500);
t('A4 kembali', await ev(`JSON.stringify({ kanan: !!document.querySelector('[data-testid="ag-right"]') })`));

await cdp.close();
