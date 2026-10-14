import { Cdp } from './lib-cdp.mjs';
import fs from 'fs';
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

const USER_PROMPT = fs.readFileSync('scripts/_prompt-toko.txt', 'utf8');
// Karena ini otomatis (tanpa manusia untuk jawab CLARIFY), beri arahan pakai default masuk akal.
const PROMPT = USER_PROMPT + `

=====================================================================
## CATATAN EKSEKUSI (otomatis, tidak ada manusia untuk menjawab CLARIFY)
=====================================================================
Lewati langkah CLARIFY. Pakai default masuk akal berikut dan LANGSUNG eksekusi:
- Niche: kopi (coffee shop + beans online). Brand: "Kopi Nusantara", tagline "Dari kebun ke cangkirmu".
- Vibe: modern hangat (coklat/krem), light+dark mode.
- Mata uang: Rupiah (Rp). Target: pecinta kopi Indonesia.
- AI: nama "Sasa", persona ramah + jualan halus. Demo Mode aktif (tanpa API key).
Buat SEMUA berkas di folder baru "toko2" di dalam workspace. Tulis isi LANGSUNG dan utuh.
Setelah semua berkas ada, buat server.js (Express proxy) dan README. JANGAN berhenti sebelum semua todo done.
Verifikasi SEKALI di akhir.`;

await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(PROMPT)}); return true; })())`);
console.log('DIKIRIM', new Date().toISOString());
await cdp.close();
