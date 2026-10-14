import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
for (let i=0;i<40;i++){
  const ada = await cdp.json(`return JSON.stringify({ z: typeof window.__ZEPHYR__, ai: typeof window.__ZEPHYR_AI__ })`).catch(()=>({z:'err'}));
  console.log(i, JSON.stringify(ada));
  if (ada.z==='object' && ada.ai==='object') { console.log('BRIDGE SIAP'); break; }
  await new Promise(s=>setTimeout(s,3000));
}
await cdp.close();
