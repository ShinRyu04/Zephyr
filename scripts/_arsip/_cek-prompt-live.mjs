import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(process.argv[2] || '9223', ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const o = await cdp.json(`return JSON.stringify((() => {
  const P = window.__ZEPHYR_PROMPT__;
  const k = ['id','en'].map((l) => String(P.system(l, 'K', 'A') || ''));
  const teks = k.sort((a,b) => b.length - a.length)[0] || '';
  const ambil = (re) => { const m = teks.match(re); return m ? m[0].slice(0, 260) : null; };
  return {
    panjang: teks.length,
    maxPanes: ambil(/agents:[^\n]{0,240}maxPanes[^\n]{0,40}/),
    seksiZephyr: ambil(/## Answering questions about Zephyr itself[\s\S]{0,300}/),
    aturanPrompt: ambil(/answered from the Zephyr facts block above[^\n]{0,120}/),
    toolFolder: ambil(/Folder-scoped tools[^\n]{0,120}/),
  };
})())`, 40000);
for (const [k, v] of Object.entries(o)) console.log(k + ' => ' + (v === null ? 'TIDAK ADA' : v));
await cdp.close();
