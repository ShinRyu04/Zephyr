import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr']);

// workspace ke D:/Testing
await cdp.json(`window.__ZEPHYR__.getState().openWorkspace('D:/Testing'); return JSON.stringify('ok');`);
for (let i=0;i<60;i++){ const r=await cdp.json(`return JSON.stringify({ws:window.__ZEPHYR__.getState().workspace})`); if(r.ws==='D:/Testing')break; await new Promise(s=>setTimeout(s,1000)); }

await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  if (A.setProvider) A.setProvider('custom');
  if (A.setModel) A.setModel('mr-vip');
  if (A.newChat) A.newChat();
  if (A.setApprovalMode) A.setApprovalMode('auto');
  if (A.setAgentSteps) A.setAgentSteps([]);
  const s = window.__ZEPHYR_AI__.store.getState();
  return { model: s.model, provider: s.provider, approval: s.approvalMode, ws: window.__ZEPHYR__.getState().workspace };
})())`).then(r=>console.log('SETUP:', JSON.stringify(r)));

const TUGAS = 'Buatkan folder baru bernama "web-landing" lalu buat website landing page lengkap di dalamnya: index.html (hero, fitur, kontak), styles.css (modern, responsif), dan script.js (interaktif). Isi kontennya benar-benar, jangan placeholder. Setelah selesai, jalankan perintah untuk memastikan ketiga berkas ada.';

await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)}); return true; })())`);
console.log('TUGAS DIKIRIM:', new Date().toISOString());
await cdp.close();
