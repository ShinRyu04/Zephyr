import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

const langkah = [];
langkah.push(['mulai', await cdp.eval(`document.querySelectorAll('.ag-tab').length + '|' + (document.querySelector('[data-testid="ag-start-here"]') ? 'start' : '-')`, 20000)]);

/* Buka Diff View lewat tombol + menu. */
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-tab-plus"]')?.click(); return 1; })()`, 10000);
await new Promise((x) => setTimeout(x, 400));
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-open-diff"]')?.click(); return 1; })()`, 10000);
await new Promise((x) => setTimeout(x, 3500));
langkah.push(['diff', await cdp.eval(`document.querySelectorAll('.ag-diff-row').length + '|' + (document.querySelector('[data-testid="ag-diff-more"]')?.textContent ?? '-')`, 30000)]);

/* Nyalakan "Show file diff" pada SATU berkas (setelah filter). */
await cdp.eval(
  `(() => {
     const f = document.querySelector('[data-testid="ag-diff-filter"]');
     const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
     set.call(f, 'AgentsBrowser.tsx');
     f.dispatchEvent(new Event('input', { bubbles: true }));
     return 1;
   })()`,
  15000,
);
await new Promise((x) => setTimeout(x, 1000));
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-diff-toggle-diff"]').click(); return 1; })()`, 10000);
await new Promise((x) => setTimeout(x, 4000));
langkah.push(['patch', await cdp.eval(`(document.querySelector('.ag-diff-patch')?.textContent ?? '(kosong)').slice(0, 90)`, 30000)]);

for (const [k, v] of langkah) console.log(k, '=>', v);
cdp.close();
