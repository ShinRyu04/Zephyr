import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify(await (async () => {
  const { invoke } = window.__TAURI__.core;
  try { const pm = await invoke('get_public_models'); 
    return pm.map(p=>({id:p.id, hasKey:p.hasKey})); } catch(e){ return {err:String(e).slice(0,100)}; }
})())`).catch(e=>({err:String(e).slice(0,120)}));
console.log(JSON.stringify(r,null,1));
await cdp.close();
