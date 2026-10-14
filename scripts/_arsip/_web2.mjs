import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
await cdp.json(`window.__ZEPHYR__.getState().openWorkspace('D:/Testing'); return JSON.stringify('ok');`);
for (let i=0;i<60;i++){ const r=await cdp.json(`return JSON.stringify({ws:window.__ZEPHYR__.getState().workspace})`); if(r.ws==='D:/Testing')break; await new Promise(s=>setTimeout(s,1000)); }
await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  if (A.setProvider) A.setProvider('custom');
  if (A.setModel) A.setModel('mr-vip');
  if (A.newChat) A.newChat();
  if (A.setApprovalMode) A.setApprovalMode('auto');
  if (A.setAgentSteps) A.setAgentSteps([]);
  return true;
})())`);

const TUGAS = [
  'Buat website portofolio studio desain grafis yang kaya dan lengkap, terinspirasi gaya Studio Feixen (studiofeixen.ch): tipografi besar dan berani, warna-warna cerah kontras, grid proyek, animasi halus saat scroll, kursor kustom, dan transisi antar bagian.',
  'Buat di folder baru bernama "studio-grafis" di dalam workspace.',
  'Struktur minimal: index.html (beranda dengan hero tipografi besar + grid karya), work.html (galeri proyek), about.html (tentang studio + tim), contact.html (kontak), styles.css (desain lengkap, responsif, variabel warna, animasi), main.js (navigasi, animasi scroll reveal, kursor kustom, filter galeri).',
  'Isi konten harus NYATA dan panjang: minimal 6 proyek dengan judul + deskripsi, profil 4 anggota tim, teks tentang yang bermakna. Jangan lorem ipsum.',
  'Setelah selesai, jalankan perintah shell untuk memastikan semua berkas ada dan hitung jumlah barisnya.',
  'Kerjakan sampai benar-benar selesai, jangan berhenti di tengah.',
].join(' ');

await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)}); return true; })())`);
console.log('TUGAS DIKIRIM');
await cdp.close();
