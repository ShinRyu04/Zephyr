import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
const bus = [];
cdp.send('Runtime.enable').catch(() => {});

console.log(
  await cdp.eval(
    `(async () => {
       const cmd = await import('/src/lib/commands.ts');
       const r = await cmd.gitStatus();
       return 'langsung: ' + JSON.stringify(r).slice(0, 200);
     })().catch(e => 'ERR ' + (e && e.message ? e.message : String(e)))`,
    60000,
  ),
);
cdp.close();
void bus;
