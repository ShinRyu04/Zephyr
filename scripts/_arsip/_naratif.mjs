import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
// lihat langkah asisten: berapa yang punya teks naratif vs kosong
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const steps=(A.agentSteps||[]);
  // hitung urutan: tiap 'mulai' seharusnya diikuti teks? kita lihat tool tanpa narasi
  const tools=steps.filter(x=>x.kind==='tool');
  const sess=A.activeSession?A.activeSession():null;
  const m=sess&&sess.messages.length?sess.messages[sess.messages.length-1]:null;
  // bagi content jadi segmen antar baris kosong
  const segs=m?String(m.content||'').split(/\n\n+/).filter(s=>s.trim()):[];
  return { nTool:tools.length, nSegmenNaratif:segs.length, contohSegmen:segs.slice(-4) };
})())`);
console.log(r);
await cdp.close();
