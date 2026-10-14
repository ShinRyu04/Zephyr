import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
// reload supaya bundle terbaru dari vite 5173 kebaca
await cdp.send('Page.reload', { ignoreCache: true }).catch(()=>{});
await new Promise(s=>setTimeout(s,8000));
const r = await cdp.json(`return JSON.stringify(await (async () => {
  try {
    const m = await import('/src/lib/systemPrompt.ts');
    const p = m.systemPromptFor('follow','','', 'mr-vip','custom','short');
    return { ada7: /JANGAN membuat script bantu|Do NOT write helper scripts/.test(p), panjang: p.length };
  } catch(e){ return { err: String(e).slice(0,160) }; }
})())`).catch(e=>({err:String(e).slice(0,160)}));
console.log(JSON.stringify(r));
await cdp.close();
