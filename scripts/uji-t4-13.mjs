// uji-t4-13.mjs — subagent & AI berdiri sendiri (pemisahan).
//
// PERMINTAAN USER (verbatim): "hpus klaim palsu dari prompt teks UI ,jujur
// subagent murni manual ,dan jga sub agent klo kerja jgn muncul di teks AI ,
// jdi dipisahin aja ,jdi sama" berdiri sndri gtu"
//
// Yang diperiksa:
//   1. System prompt TIDAK lagi mengklaim Zeph bisa memanggil subagent.
//   2. Prompt menyebut dengan jujur bahwa subagent dijalankan user.
//   3. Menjalankan subagent TIDAK menambah pesan di chat AI.
//   4. Teks UI di tab Subagents tidak mengklaim agent memanggil subagent.
//   5. Ringkasan tetap tersedia di store (tab Subagents).
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) lulus++;
  else gagal++;
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? '  ' + info : ''}`);
};

// ── 1. System prompt jujur ────────────────────────────────────────────────
const r1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const p = window.__ZEPHYR_PROMPT__.system('follow', '', '');
  return {
    panjang: p.length,
    klaimMemanggil: /memanggil subagent paralel/i.test(p),
    klaimGunakan: /gunakan subagent paralel/i.test(p),
    sebutUser: /subagent paralel dijalankan USER/i.test(p),
    masihSebutSubagent: /subagent/i.test(p),
  };
})())`,
  60000,
);
cek('prompt TIDAK mengklaim "memanggil subagent paralel"', !r1.klaimMemanggil);
cek('prompt TIDAK menyuruh "gunakan subagent paralel"', !r1.klaimGunakan);
cek('prompt menyebut subagent dijalankan USER', r1.sebutUser);
cek('prompt masih menyebut subagent (konteks jujur)', r1.masihSebutSubagent, `${r1.panjang} karakter`);

// ── 2. Daftar tool TIDAK memuat tool subagent (bukti klaim itu palsu) ─────
const r2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const p = window.__ZEPHYR_PROMPT__.system('follow', '', '');
  // Blok "# Tool yang tersedia" berisi daftar tool.
  const blok = p.split('# Tool yang tersedia')[1]?.split('\\n\\n')[0] ?? '';
  const nama = [...blok.matchAll(/^- (\\w+):/gm)].map((m) => m[1]);
  return { jumlah: nama.length, nama, adaSubagent: nama.some((n) => /subagent/i.test(n)) };
})())`,
  60000,
);
cek('tidak ada tool subagent di daftar', !r2.adaSubagent, `${r2.jumlah} tool`);

// ── 3. Subagent jalan -> chat AI TIDAK bertambah ──────────────────────────
const r3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 800));
  const AI = window.__ZEPHYR_AI__.store.getState();
  await AI.loadKeys();
  await AI.setModel('gemini-3.8-flash');
  await new Promise((r) => setTimeout(r, 700));
  window.__ZEPHYR_AI__.store.getState().newChat();
  await new Promise((r) => setTimeout(r, 500));

  const sebelum = window.__ZEPHYR_AI__.store.getState().sessions
    .find((s) => s.id === window.__ZEPHYR_AI__.store.getState().activeId)?.messages.length ?? 0;

  // Verifikasi baseUrl mock benar-benar terpasang — kalau tidak, request pergi
  // ke API asli dan uji menggantung sampai timeout.
  const bu = S.getState().settings.models.providers.gemini?.baseUrl ?? '';
  if (!bu.includes('8098')) throw new Error('baseUrl mock tidak terpasang: ' + bu);

  window.__ZEPHYR_SUB__.bersihkan();
  await new Promise((r) => setTimeout(r, 400));
  await window.__ZEPHYR_SUB__.store.getState().jalankan([
    'Balas satu kata: SATU',
    'Balas satu kata: DUA',
  ]);
  // Tunggu subagent benar-benar selesai.
  const batas = Date.now() + 30000;
  while (Date.now() < batas && window.__ZEPHYR_SUB__.store.getState().sibuk) {
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 900));

  const st = window.__ZEPHYR_AI__.store.getState();
  const sesudah = st.sessions.find((s) => s.id === st.activeId)?.messages.length ?? 0;
  const sub = window.__ZEPHYR_SUB__.store.getState();
  return {
    sebelum, sesudah,
    subAgents: sub.agents.length,
    subSelesai: sub.agents.filter((a) => a.status === 'selesai').length,
    adaRingkasan: !!sub.ringkasan,
    ringkasPanjang: sub.ringkasan?.length ?? 0,
  };
})())`,
  180000,
);
cek('subagent benar-benar jalan', r3.subSelesai === 2, `${r3.subSelesai}/2 selesai`);
cek('ringkasan tetap dibuat (untuk tab Subagents)', r3.adaRingkasan, `${r3.ringkasPanjang} karakter`);
cek('chat AI TIDAK bertambah', r3.sesudah === r3.sebelum, `${r3.sebelum} -> ${r3.sesudah} pesan`);

// ── 4. Chat tidak memuat teks ringkasan subagent ──────────────────────────
const r4 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR_AI__.store.getState();
  const sesi = st.sessions.find((s) => s.id === st.activeId);
  const teks = (sesi?.messages ?? []).map((m) => m.content).join('\\n');
  return {
    adaHeaderSubagent: /subagent selesai/i.test(teks),
    jumlahPesan: (sesi?.messages ?? []).length,
  };
})())`,
  60000,
);
cek('tidak ada pesan "subagent selesai" di chat', !r4.adaHeaderSubagent, `${r4.jumlahPesan} pesan`);

// ── 5. Teks UI tab Subagents jujur ────────────────────────────────────────
const r5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  // Kosongkan dulu supaya empty-state (tempat teks jujur itu berada) benar-benar
  // dirender — kalau masih ada kartu, cabangnya yang lain yang tampil.
  window.__ZEPHYR_SUB__.bersihkan();
  window.__ZEPHYR_TERM__.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1400));
  const view = document.querySelector('[data-testid="subagents-view"]');
  const teks = view?.textContent ?? '';
  return {
    klaimPalsu: /Agent utama juga bisa memanggil/i.test(teks),
    jujur: /berdiri sendiri/i.test(teks),
    adaRingkas: !!document.querySelector('[data-testid="sav-ringkas"]'),
  };
})())`,
  90000,
);
cek('teks UI TIDAK mengklaim agent memanggil subagent', !r5.klaimPalsu);
cek('teks UI menyebut "berdiri sendiri"', r5.jujur);

// Bersihkan.
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR_SUB__.bersihkan();
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  await new Promise((r) => setTimeout(r, 600));
  return 1;
})())`,
  90000,
);
await cdp.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal > 0 ? 1 : 0);
