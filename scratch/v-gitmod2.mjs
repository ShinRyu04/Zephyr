import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && !t.url.includes('#'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
console.log(
  await cdp.eval(
    `(async () => {
       try {
         const m = await import('/src/lib/commands.ts');
         const r = await m.gitStatus();
         return 'utama via modul: ' + JSON.stringify(r).slice(0, 120);
       } catch (e) { return 'utama ERR: ' + (e && (e.message || e.code) ? (e.message || e.code) : JSON.stringify(e)); }
     })()`,
    40000,
  ),
);
cdp.close();
