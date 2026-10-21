import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
console.log(
  await cdp.eval(
    `(async () => {
       const { invoke } = await import('@tauri-apps/api/core');
       try { const r = await invoke('git_status'); return 'git_status ok: ' + JSON.stringify(r).slice(0, 200); }
       catch (e) { return 'git_status ERR: ' + JSON.stringify(e).slice(0, 240); }
     })()`,
    60000,
  ),
);
cdp.close();
