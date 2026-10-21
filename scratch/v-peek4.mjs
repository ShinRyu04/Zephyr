import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
await new Promise((x) => setTimeout(x, 5000));
console.log(
  await cdp.eval(
    `(() => {
       const X = window.__ZEPHYR_AI__;
       const st = X && X.store ? X.store.getState() : null;
       return 'right=' + !!document.querySelector('[data-testid="agents-right"]')
         + ' layout=' + !!document.querySelector('[data-testid="agents-layout"]')
         + ' konv=' + !!document.querySelector('[data-testid="agx-conversation"]')
         + ' mulai=' + !!document.querySelector('[data-testid="agx-starting"]')
         + ' pesan=' + (st ? st.sessions.length : 'X?')
         + ' aktif=' + (st ? JSON.stringify(st.activeIds) : '')
         + ' err=' + ([...document.querySelectorAll('.error-boundary, .err')].length);
     })()`,
    25000,
  ),
);
cdp.close();
