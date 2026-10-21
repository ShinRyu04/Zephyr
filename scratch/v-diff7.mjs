import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
const ev = (e, ms = 20000) => cdp.eval(e, ms);

console.log('0', await ev(`window.__ZEPHYR_GIT__.status()?.isRepo`));
await ev(`window.__ZEPHYR_GIT__.refresh().then(()=>{}).catch(()=>{})`, 90000).catch((e) => console.log('refresh reject:', e.message));
await new Promise((x) => setTimeout(x, 4000));
console.log('1', await ev(`'repo=' + window.__ZEPHYR_GIT__.status()?.isRepo + ' n=' + window.__ZEPHYR_GIT__.status()?.changes.length + ' err=' + window.__ZEPHYR_GIT__.error()`));
await ev(`(() => { document.querySelector('[data-testid="ag-tab-plus"]')?.click(); return 1; })()`);
await new Promise((x) => setTimeout(x, 500));
await ev(`(() => { document.querySelector('[data-testid="ag-open-diff"]')?.click(); return 1; })()`);
await new Promise((x) => setTimeout(x, 5000));
console.log('2', await ev(`document.querySelectorAll('.ag-diff-row').length + '|' + (document.querySelector('[data-testid="ag-diff-more"]')?.textContent ?? '-') + '|' + (document.querySelector('[data-testid="ag-diff-total"]')?.textContent ?? '')`, 40000));
cdp.close();
