/**
 * uji-busy-reset.mjs — berapa lama `agentBusy` baru kembali false setelah run
 * benar-benar selesai, dan apakah tugas berikutnya boleh dikirim saat itu juga.
 *
 * Gejala yang diukur (pernah kejadian): run kelar (berkas tertulis, todo penuh)
 * tapi `agentBusy` masih true selama beberapa menit, sehingga peluncuran uji
 * berikutnya ditolak dengan "agen masih sibuk".
 *
 * Yang diperiksa:
 *   B1 jeda langkah-terakhir -> agentBusy=false  (harus <= 5 detik)
 *   B2 agentBusy tetap false 3 detik setelahnya (tidak nyala sendiri)
 *   B3 tidak ada penanda sibuk yang tertinggal di peta per-composer / fase
 *   B4 tugas KEDUA diterima segera setelah yang pertama kelar (tidak kebatal)
 *
 *   node scripts/uji-busy-reset.mjs [port]        Launcher: scripts/_run-busy.bat
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = 'D:/Testing';
const R = reporter('agentBusy: seberapa cepat dilepas setelah run kelar');

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

const awal = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, ws: window.__ZEPHYR__.getState().workspace };
})())`);
console.log(`     awal: busy=${awal.busy} ws=${awal.ws}`);
if (awal.busy) {
  console.log('     BERHENTI: agen masih sibuk sebelum uji dimulai.');
  await cdp.close();
  process.exit(2);
}

await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS)}); return true; })())`);

async function kirim(teks, batasMs) {
  return await cdp.json(
    `return JSON.stringify(await (async () => {
      const A = window.__ZEPHYR_AI__.store;
      const t0 = Date.now();
      if (A.getState().newChat) A.getState().newChat();
      if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
      void A.getState().send(${JSON.stringify(teks)});
      while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
      const terkirim = A.getState().agentBusy;
      let nTerakhir = -1;
      let tLangkah = Date.now();
      let tBusy = 0;
      while (Date.now() - t0 < ${batasMs}) {
        const s = A.getState();
        const n = (s.agentSteps || []).length;
        if (n !== nTerakhir) { nTerakhir = n; tLangkah = Date.now(); }
        if (!s.agentBusy) { tBusy = Date.now(); break; }
        await new Promise((r) => setTimeout(r, 200));
      }
      const s2 = A.getState();
      return {
        terkirim, diterima_ms: Date.now() - t0,
        gap_ms: tBusy ? tBusy - tLangkah : null,
        kelar: !!tBusy,
        langkah: (s2.agentSteps || []).length,
        phase: s2.agentPhase,
        agentBusys: s2.agentBusys,
        pending: !!s2.pending,
      };
    })())`,
    batasMs + 30000,
  );
}

const satu = await kirim(
  [
    'Uji singkat. Di workspace ini, tulis SATU berkas bernama `busy-reset.txt` berisi satu baris: ok.',
    'Jangan membaca berkas lain, jangan menjalankan perintah shell. Setelah menulis, jawab satu kalimat: selesai.',
  ].join('\n'),
  240000,
);
console.log(`     run-1: terkirm=${satu.terkirim} kelar=${satu.kelar} langkah=${satu.langkah} jeda-busy=${satu.gap_ms === null ? '-' : Math.round(satu.gap_ms / 1000) + 's'}`);
console.log(`            phase=${satu.phase} agentBusys=${JSON.stringify(satu.agentBusys)} pending=${satu.pending}`);

await new Promise((r) => setTimeout(r, 3000));
const nyala = await cdp.json(`return JSON.stringify({ busy: window.__ZEPHYR_AI__.store.getState().agentBusy })`);

const dua = await kirim('Balas satu kata saja: ok. Tidak perlu memakai tool apa pun.', 90000);
console.log(`     run-2 diterima=${dua.terkirim} (ditunggu ${Math.round(dua.diterima_ms / 1000)}s), kelar=${dua.kelar}`);

const sisaSibuk = Object.entries(dua.agentBusys || {}).filter(([, v]) => v).map(([k]) => k || '(default)');
R.check('B1', satu.kelar && satu.gap_ms !== null && satu.gap_ms <= 5000, `jeda langkah-terakhir -> busy=false: ${satu.gap_ms === null ? 'tidak pernah lepas' : Math.round(satu.gap_ms / 1000) + 's'}`);
R.check('B2', !nyala.busy, `tetap false 3 detik setelah run kelar (busy=${nyala.busy})`);
R.check('B3', sisaSibuk.length === 0 && dua.phase === 'idle', `tak ada penanda sibuk tertinggal (busy: ${sisaSibuk.join(', ') || 'tidak ada'}, fase=${dua.phase})`);
R.check('B4', dua.terkirim === true && dua.diterima_ms <= 15000, `tugas kedua langsung diterima (${Math.round(dua.diterima_ms / 1000)}s)`);

await cdp.close();
R.selesai();
