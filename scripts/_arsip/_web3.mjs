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

const PROMPT = `# PERAN
Kamu senior full-stack engineer + UI/UX designer. Bangun WEBSITE LENGKAP dari nol, banyak file, siap pakai. Menyeluruh, jangan setengah-setengah, jangan placeholder kosong.

# PRODUK
- Nama: RANTAU
- Jenis: landing page SaaS
- Tujuan: platform booking homestay lokal untuk pelancong Indonesia
- Target: pelancong muda + pemilik homestay
- Fitur wajib: hero, pencarian destinasi, daftar homestay unggulan, cara kerja, testimoni, harga, FAQ, kontak
- Bahasa: Indonesia

# STACK (statis, tanpa framework/npm install)
- HTML + CSS + JavaScript murni (vanilla), multi-file, tanpa build step
- Design tokens via CSS variables, dark + light mode
- Responsif mobile-first, animasi scroll halus, aksesibilitas dasar

# STRUKTUR FILE (buat di folder baru "rantau")
rantau/index.html, rantau/about.html, rantau/kontak.html,
rantau/css/styles.css, rantau/js/main.js,
rantau/README.md

# ISI
Konten NYATA dan panjang (bukan lorem): minimal 6 homestay dengan nama+lokasi+harga+deskripsi, 3 testimoni, 3 paket harga, 5 FAQ.
Semua halaman: header+nav+footer konsisten, dark/light toggle jalan, form kontak tervalidasi.

# CARA KERJA (WAJIB)
1. Tulis rencana ke todo_write dulu.
2. Bangun bertahap, tulis SETIAP file benar-benar ke disk.
3. Jangan klaim selesai sebelum semua file ada; verifikasi lewat shell di akhir.
4. Kerjakan SAMPAI TUNTAS, jangan berhenti di tengah.

# DEFINITION OF DONE
- Semua file di struktur di atas ADA di disk dan terisi penuh
- Tidak ada TODO/placeholder kosong
- README menjelaskan cara buka
- Verifikasi akhir via shell (list + hitung baris)`;

await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(PROMPT)}); return true; })())`);
console.log('PROMPT DIKIRIM', new Date().toISOString());
await cdp.close();
