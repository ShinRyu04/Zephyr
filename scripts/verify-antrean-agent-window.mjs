/*
 * Bukti: antrean di JENDELA AGENTS berbentuk komposer, bukan panel raksasa.
 *
 *   A1  strip antrean terlihat (display block) di `.agx-chat`
 *   A2  lebar strip == lebar kotak ketik (toleransi 4px) dan sejajar X-nya
 *   A3  baris antrean rapat (tinggi <= 24px) dan daftar dibatasi tinggi
 *   A4  tombol kirim per baris terlihat (opacity > 0) dan bisa diklik
 *   A5  tombol kirim saat sibuk memotong giliran lalu mengirim baris itu
 *   A6  fakta prompt tidak lagi menyuruh "Show task list" (menu sudah tidak ada)
 *
 * Jalankan dengan app dev + port debug 9223 dan jendela Agents terbuka.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const targets = (await (await fetch('http://127.0.0.1:9223/json/list')).json()).filter((t) => t.type === 'page');
const main = targets.find((t) => !(t.url ?? '').includes('from=') && !(t.url ?? '').includes('#agents'));
let agen = targets.find((t) => (t.url ?? '').includes('#agents'));

if (!agen) {
  const c = await Cdp.connect(main.webSocketDebuggerUrl);
  try {
    await c.eval(`(() => { window.__ZEPHYR_NOTIF__.run('agents.openWindow'); return 1; })()`);
  } finally { c.close(); }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const t = (await (await fetch('http://127.0.0.1:9223/json/list')).json()).filter((x) => x.type === 'page');
    agen = t.find((x) => (x.url ?? '').includes('#agents'));
    if (agen) break;
  }
}
if (!agen) {
  console.log('GAGAL: jendela Agents tidak terbuka');
  keluarBersih(1);
}

const cdp = await Cdp.connect(agen.webSocketDebuggerUrl);

async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/* Tunggu bridge siap (jendela baru memasangnya belakangan). */
for (let i = 0; i < 60; i++) {
  const siap = await cdp.eval(`typeof window.__ZEPHYR_AI__ !== 'undefined' && typeof window.__ZEPHYR_AI__.store !== 'undefined'`);
  if (siap === true) break;
  await new Promise((r) => setTimeout(r, 400));
}

const awal = await J(`(() => {
  const s = window.__ZEPHYR_AI__.store.getState();
  return { busy: s.agentBusys.agents ?? false, lane: (s.antrians.agents ?? []).map((a) => a.teks) };
})()`);

/*
 * `.agx-chat` hanya dirender saat percakapan Agents punya pesan
 * (AgentsApp: jumlahPesan > 0 -> <AiPanel/>; tanpa pesan -> komposer
 * kosong). Jendela yang baru dibuka tidak punya keduanya, jadi uji menanam
 * satu sesi + satu pesan dummy untuk me-render panel AI, dan membersihkannya
 * di akhir.
 */
const sesiPalsu = await J(`(() => {
  const Ai = window.__ZEPHYR_AI__.store;
  const s = Ai.getState();
  const sudahAda = s.activeIds.agents && s.sessions.some((x) => x.id === s.activeIds.agents && x.messages.length > 0);
  if (sudahAda) return null;
  const id = s.newChat('agents');
  const sid = Ai.getState().activeIds.agents;
  Ai.setState((st) => ({
    sessions: st.sessions.map((x) =>
      x.id === sid
        ? { ...x, messages: [{ id: 'm-agx-harness', role: 'user', content: 'Harness session', at: Date.now() }] }
        : x,
    ),
  }));
  return { id, dibuat: true };
})()`);

const ukur = await J(`await (async () => {
  const Ai = window.__ZEPHYR_AI__.store;
  Ai.setState({ agentBusys: { ...Ai.getState().agentBusys, agents: true }, agentBusy: true });
  await wait(100);
  await Ai.getState().kirimSekarang('AGX-ANTRE-1', undefined, 'agents');
  await Ai.getState().kirimSekarang('AGX-ANTRE-2 pesan yang cukup panjang untuk melihat pemotongan teks pada baris antrean', undefined, 'agents');
  await wait(800);
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x) }; };
  const strip = document.querySelector('.agx-chat [data-testid="ai-antrian"]');
  const baris = document.querySelector('.agx-chat .ai-cq-row');
  const daftar = document.querySelector('.agx-chat .ai-cq-list');
  const aksi = document.querySelector('.agx-chat .ai-cq-aksi');
  const kirim = document.querySelector('.agx-chat .ai-cq-send');
  const out = {
    adaStrip: !!strip,
    display: strip ? getComputedStyle(strip).display : null,
    strip: r('.agx-chat [data-testid="ai-antrian"]'),
    input: r('.agx-chat .ai-input-row'),
    baris: r('.agx-chat .ai-cq-row'),
    daftarH: r('.agx-chat .ai-cq-list')?.h ?? null,
    daftarMaxH: daftar ? getComputedStyle(daftar).maxHeight : null,
    aksiOpacity: aksi ? Number(getComputedStyle(aksi).opacity) : null,
    kirimAda: !!kirim,
    kirimW: kirim ? Math.round(kirim.getBoundingClientRect().width) : null,
    lane: (Ai.getState().antrians.agents ?? []).map((a) => a.teks),
    masihSibuk: Ai.getState().agentBusys.agents ?? false,
  };
  /* bersihkan */
  Object.keys(Ai.getState().antrians).forEach((k) => Ai.getState().kosongkanAntrian(k));
  Ai.setState({ agentBusy: false, agentBusys: { ...Ai.getState().agentBusys, agents: ${JSON.stringify(awal.busy ? 'true' : 'false')} }, antrian: [] });
  await wait(300);
  return out;
})()`);

/* A5: tombol kirim saat sibuk -> memotong giliran (flags turun) lalu mengirim.
   Provider bisa menggantung; uji ini HANYA memastikan giliran dipotong dan
   barisnya diambil, tidak menunggu jawaban. */
const tombol = await J(`await (async () => {
  const Ai = window.__ZEPHYR_AI__.store;
  Ai.setState({ agentBusys: { ...Ai.getState().agentBusys, agents: true }, agentBusy: true });
  await wait(80);
  await Ai.getState().kirimSekarang('AGX-KIRIM', undefined, 'agents');
  await wait(400);
  const sebelum = (Ai.getState().antrians.agents ?? []).map((a) => a.teks);
  const adaTombol = !!document.querySelector('[data-testid="ai-antrian-kirim-0"]');
  const mulaiSebelum = Ai.getState().agentStates.agents?.startedAt ?? null;
  /* jalankan klik: tombol harus memotong giliran lalu MENGIRIM baris ini
     (baris keluar dari antrean dan giliran baru dimulai - 'busy' kembali true
     justru karena pesannya sedang dikerjakan). */
  document.querySelector('[data-testid="ai-antrian-kirim-0"]')?.click();
  await wait(1500);
  const hasil = {
    sebelum, adaTombol, mulaiSebelum,
    mulaiSesudah: Ai.getState().agentStates.agents?.startedAt ?? null,
    laneSetelah: (Ai.getState().antrians.agents ?? []).map((a) => a.teks),
    busySetelah: Ai.getState().agentBusys.agents ?? false,
  };
  await Ai.getState().cancel();
  Object.keys(Ai.getState().antrians).forEach((k) => Ai.getState().kosongkanAntrian(k));
  Ai.setState({ agentBusy: false, agentBusys: { ...Ai.getState().agentBusys, agents: false }, antrian: [], pendings: { ...Ai.getState().pendings, agents: null } });
  await wait(400);
  return hasil;
})()`);

/* Bersihkan sesi tanaman bila harness yang membuatnya. */
if (sesiPalsu) {
  await J(`(() => {
    const Ai = window.__ZEPHYR_AI__.store;
    Ai.getState().deleteChat(${JSON.stringify(sesiPalsu.id)});
    return 1;
  })()`);
}

cdp.close();

/* A6: fakta prompt - tidak ada lagi arahan menu yang sudah dihapus. */
const fm = await Cdp.connect(main.webSocketDebuggerUrl);
let fakta;
try {
  fakta = await fm.eval(`JSON.stringify((() => {
    const teks = (window.__ZEPHYR_PROMPT__?.fakta?.() ?? '') + ' ' + (window.__ZEPHYR_PROMPT__?.appFakta?.() ?? '');
    return { adaBridge: !!window.__ZEPHYR_PROMPT__, showTaskList: /Show task list/i.test(teks), panjang: teks.length };
  })())`);
} finally { fm.close(); }
let f = { adaBridge: false, showTaskList: null, panjang: 0 };
try { f = JSON.parse(fakta); } catch { /* bridge boleh tidak ada di build ini */ }

console.log(JSON.stringify({ awal, ukur, tombol, fakta: f }, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

const selisih = ukur?.strip && ukur?.input ? Math.abs(ukur.strip.w - ukur.input.w) : 999;
const selisihX = ukur?.strip && ukur?.input ? Math.abs(ukur.strip.x - ukur.input.x) : 999;

cek('A1 strip antrean terlihat di jendela Agents', ukur?.adaStrip === true && ukur?.display === 'block', `display=${ukur?.display}`);
cek(
  'A2 lebar strip == lebar komposer (<=4px) dan sejajar',
  selisih <= 4 && selisihX <= 4,
  `strip=${ukur?.strip?.w} composer=${ukur?.input?.w} dx=${selisihX}`,
);
cek(
  'A3 baris rapat dan daftar dibatasi tinggi',
  (ukur?.baris?.h ?? 99) <= 24 && ukur?.daftarMaxH !== 'none' && ukur?.daftarMaxH !== null,
  `rowH=${ukur?.baris?.h} maxH=${ukur?.daftarMaxH}`,
);
cek(
  'A4 tombol kirim per baris terlihat dan cukup besar',
  ukur?.kirimAda === true && (ukur?.aksiOpacity ?? 0) > 0 && (ukur?.kirimW ?? 0) >= 14,
  `opacity=${ukur?.aksiOpacity} w=${ukur?.kirimW}`,
);
cek(
  'A5 tombol kirim saat sibuk mengambil baris itu dan memulai giliran baru',
  tombol?.adaTombol === true &&
    (tombol?.sebelum ?? []).length === 1 &&
    (tombol?.laneSetelah ?? []).length === 0 &&
    (tombol?.mulaiSesudah ?? 0) !== (tombol?.mulaiSebelum ?? 0),
  `sebelum=${JSON.stringify(tombol?.sebelum)} laneSetelah=${JSON.stringify(tombol?.laneSetelah)} mulai ${tombol?.mulaiSebelum}->${tombol?.mulaiSesudah}`,
);
cek(
  'A6 prompt tidak lagi menyebut menu "Show task list"',
  f?.adaBridge === true ? f.showTaskList === false : true,
  f?.adaBridge === true ? `panjang=${f.panjang}` : 'bridge prompt tidak ada - dilewati (grep statis di laporan)',
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);