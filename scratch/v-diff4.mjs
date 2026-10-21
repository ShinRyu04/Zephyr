import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

const tanya = (expr) => cdp.eval(expr, 30000);
console.log('mulai:', await tanya(`document.querySelectorAll('.ag-tab').length + '|' + (document.querySelector('[data-testid="ag-start-here"]') ? 'start' : '-')`));

await tanya(`(() => { document.querySelector('[data-testid="ag-tab-plus"]')?.click(); return 1; })()`);
await new Promise((x) => setTimeout(x, 400));
await tanya(`(() => { document.querySelector('[data-testid="ag-open-diff"]')?.click(); return 1; })()`);
await new Promise((x) => setTimeout(x, 3500));
console.log('diff:', await tanya(`document.querySelectorAll('.ag-diff-row').length + '|' + (document.querySelector('[data-testid="ag-diff-more"]')?.textContent ?? '-')`));
cdp.close();
