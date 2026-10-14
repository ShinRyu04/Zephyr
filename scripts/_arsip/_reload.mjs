import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
await cdp.send('Page.reload', { ignoreCache: true }).catch(()=>{});
await new Promise(s=>setTimeout(s,10000));
for (let i=0;i<30;i++){
  const ada = await cdp.json(`return JSON.stringify({ z: typeof window.__ZEPHYR__, ai: typeof window.__ZEPHYR_AI__ })`).catch(()=>({z:'err'}));
  if (ada.z==='object' && ada.ai==='object') { console.log('BRIDGE SIAP di iterasi', i); break; }
  await new Promise(s=>setTimeout(s,3000));
  if (i===29) console.log('TIMEOUT', JSON.stringify(ada));
}
await cdp.close();
