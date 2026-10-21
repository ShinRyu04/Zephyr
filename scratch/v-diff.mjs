import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
const r = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  await S.getState().openWorkspace('D:/Zephyr');
  return { ws: S.getState().workspace };
})())`, 90000);
console.log('workspace:', JSON.stringify(r));
await new Promise((x) => setTimeout(x, 2500));
const r2 = await cdp.json(`return JSON.stringify(await (async () => {
  await window.__ZEPHYR_GIT__.refresh();
  for (const b of qa('[data-testid^="ag-tab-close-"]')) b.click();
  await wait(400);
  q('[data-testid="ag-start-diff"]')?.click();
  await wait(1500);
  const total = q('[data-testid="ag-diff-total"]')?.textContent ?? '';
  const baris = qa('.ag-diff-row').length;
  const pertama = q('.ag-diff-row')?.getAttribute('title') ?? '';
  const sakelar = q('[data-testid="ag-diff-toggle-diff"]');
  sakelar?.click();
  await wait(1800);
  const patch = (q('.ag-diff-patch')?.textContent ?? '').slice(0, 120);
  return { total, baris, pertama, patch, filter: !!q('[data-testid="ag-diff-filter"]'), sisiKanan: !!q('[data-testid="agents-right"]') };
})())`, 90000);
console.log(JSON.stringify(r2, null, 2));
cdp.close();
