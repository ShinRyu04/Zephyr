import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-toggle-right"]')?.click(); return 1; })()`, 10000);
await new Promise((x) => setTimeout(x, 1500));
console.log(
  await cdp.eval(
    `'right=' + !!document.querySelector('[data-testid="agents-right"]') + ' mulai=' + !!document.querySelector('[data-testid="ag-start-here"]')`,
    20000,
  ),
);
cdp.close();
