import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
const out = await cdp.json(`return JSON.stringify(await (async () => {
  const tidur = (ms) => new Promise(r => setTimeout(r, ms));
  const ringkas = (el) => ({ tid: el.getAttribute('data-testid'), tag: el.tagName, teks: (el.textContent||'').trim().slice(0,60), judul: el.getAttribute('title')||el.getAttribute('aria-label') });
  const semua = [...document.querySelectorAll('[data-testid]')].map(ringkas);
  const gate = semua.filter(x => /gate|tools|toolset/i.test(x.tid||''));
  // cari pemicu menu "..."
  const kandidat = [...document.querySelectorAll('.ai-head-right button, .ai-head-right [role="button"]')].map(ringkas);
  return { gate, kandidat, adaToolgatePanel: !!document.querySelector('[data-testid="toolgate"]'), jumlahTid: semua.length };
})())`);
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
await cdp.close();
