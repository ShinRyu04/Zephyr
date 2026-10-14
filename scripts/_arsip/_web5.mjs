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
const PROMPT = `Buat website lengkap untuk kedai kopi "Kopi Senja" (coffee shop lokal) di folder baru "senja" di dalam workspace.

Buat SEMUA berkas ini, tulis LANGSUNG isinya, JANGAN bikin script analisis dan JANGAN membaca ulang berkas yang baru kamu tulis:
- senja/index.html — beranda: hero, tentang kami, menu unggulan, galeri suasana, jam buka, lokasi, footer
- senja/menu.html — daftar menu lengkap berkategori (kopi, non-kopi, makanan) dengan harga
- senja/kontak.html — form reservasi tervalidasi + peta/alamat + kontak
- senja/css/styles.css — desain hangat: variabel warna coklat/krem, dark/light, responsif, animasi scroll
- senja/js/main.js — toggle tema, nav mobile, reveal saat scroll, filter menu, validasi form reservasi
- senja/README.md — cara buka

Konten NYATA (bukan lorem): minimal 8 item menu dengan harga rupiah, 3 kategori, jam buka per hari, 4 nilai/keunggulan, alamat lengkap.
Kerjakan sampai SEMUA berkas ada di disk. Verifikasi SEKALI saja di akhir. Jangan berhenti sebelum semua todo done.`;
await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(PROMPT)}); return true; })())`);
console.log('DIKIRIM', new Date().toISOString());
await cdp.close();
