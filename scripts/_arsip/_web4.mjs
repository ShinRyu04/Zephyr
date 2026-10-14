import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
await cdp.json(`window.__ZEPHYR__.getState().openWorkspace('D:/Testing'); return JSON.stringify('ok');`);
for (let i=0;i<60;i++){ const r=await cdp.json(`return JSON.stringify({ws:window.__ZEPHYR__.getState().workspace})`); if(r.ws==='D:/Testing')break; await new Promise(s=>setTimeout(s,1000)); }
await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  if (A.setProvider) A.setProvider('custom2');
  if (A.setModel) A.setModel('mr-vip');
  if (A.newChat) A.newChat();
  if (A.setApprovalMode) A.setApprovalMode('auto');
  if (A.setAgentSteps) A.setAgentSteps([]);
  return true;
})())`);
const PROMPT = `Buat website landing page lengkap untuk produk "NADA" (platform streaming musik lokal Indonesia) di folder baru "nada" di dalam workspace.

Buat SEMUA berkas ini, tulis LANGSUNG, jangan bikin script analisis:
- nada/index.html — beranda: hero, fitur unggulan, cara kerja, artis populer, paket langganan, testimoni, FAQ, footer
- nada/jelajah.html — halaman jelajah lagu/album dengan grid
- nada/kontak.html — form kontak tervalidasi + info
- nada/css/styles.css — desain lengkap: variabel warna, dark/light, responsif, animasi scroll
- nada/js/main.js — toggle tema, nav mobile, reveal saat scroll, filter grid, validasi form
- nada/README.md — cara buka

Konten NYATA (bukan lorem): minimal 6 fitur, 6 artis dengan nama+genre, 3 paket harga, 4 testimoni, 5 FAQ.
Kerjakan sampai SEMUA berkas di atas ada di disk. Verifikasi SEKALI di akhir dengan satu perintah daftar+hitung baris. Jangan berhenti sebelum semua todo done.`;
await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(PROMPT)}); return true; })())`);
console.log('DIKIRIM', new Date().toISOString());
await cdp.close();
