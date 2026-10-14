import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
await cdp.json(`window.__ZEPHYR__.getState().openWorkspace('D:/Testing'); return JSON.stringify('ok');`);
await new Promise(s=>setTimeout(s,1500));
const r = await cdp.json(`return JSON.stringify(await (async()=>{
  const sp = await import('/src/lib/systemPrompt.ts');
  const prompt = sp.systemPromptFor('id','', '', 'mr-vip','custom2','');
  return { len: prompt.length, kb: (prompt.length/1024).toFixed(1) };
})())`);
console.log('system prompt sekarang:', r);
await cdp.close();
