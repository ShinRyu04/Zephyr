import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr — Code Editor', 'localhost:5173']);
cdp.snapshot = null;
await cdp.json(`return JSON.stringify((() => { window.__ZEPHYR_AI__.store.getState().newChat(''); return true; })())`);
await new Promise(r => setTimeout(r, 3000));
const TUGAS = 'Buat website company profile di folder D:/Talos/web-baru dengan 3 berkas: index.html (header nav, hero + CTA, 3 kartu fitur, footer, meta description 120-160 char, link canonical, og:title, og:description, tepat satu h1), style.css (tema gelap, CSS variables, grid responsive), script.js (smooth scroll + hamburger). Pakai write_file. Setelah selesai baca ulang lalu laporkan.';
await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  A.getState().setAgentSteps ? A.getState().setAgentSteps([]) : null;
  void A.getState().send(${JSON.stringify(TUGAS)});
  return true;
})())`);
const t0 = Date.now();
let last='';
while (Date.now() - t0 < 540000) {
  await new Promise(r => setTimeout(r, 5000));
  const s = await cdp.json(`return JSON.stringify((() => {
    const A = window.__ZEPHYR_AI__.store.getState();
    const t = (A.agentSteps||[]).filter(x=>x.kind==='tool');
    return { busy: A.agentBusy, n: t.length, last: t.length ? t[t.length-1].name : '-' };
  })())`);
  const l = `[${Math.round((Date.now()-t0)/1000)}s] busy=${s.busy} tools=${s.n} last=${s.last}`;
  if (l !== last) { console.log(l); last = l; }
  if (!s.busy) break;
}
const fin = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const m = (A.activeSession?A.activeSession().messages:[]).slice(-1)[0];
  const t = (A.agentSteps||[]).filter(x=>x.kind==='tool');
  return { busy: A.agentBusy, n: t.length, jawaban: m ? String(m.content||'') : '' };
})())`);
console.log('\n=== tools:', fin.n, '| busy:', fin.busy);
console.log('\n--- jawaban ---');
console.log(fin.jawaban.slice(0, 3000));
await cdp.close();
