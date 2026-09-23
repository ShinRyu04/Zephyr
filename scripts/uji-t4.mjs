// uji-t4.mjs — verifikasi T4.1 (tab Subagents) + T4.2 (peran).
//
// KELUHAN USER: "sub agent di AI zephyr jdi ga numpuk bnget tampilannya".
// Solusinya: subagent pindah ke TAB PANEL sendiri. Yang dibuktikan di sini:
//   1. Tab SUBAGENTS ada di tab strip panel bawah
//   2. Panel AI TIDAK lagi memuat kartu subagent (chat jadi bersih)
//   3. Tab Subagents memuat grid kartu + form tugas paralel
//   4. Ctrl+Shift+D membuka tab itu
//   5. Peran: tebak dari kata kunci, bisa dipaksa dengan @prefix
//   6. Kartu menampilkan badge peran
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== T4.1/T4.2: tab Subagents + peran ===\n');

// ── V1: tab SUBAGENTS ada di tab strip ──
const tab = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  T.getState().setVisible(true);
  await new Promise((r) => setTimeout(r, 1000));
  const P = window.__ZEPHYR_PANEL__;
  const semua = P.PANEL_TABS.map((t) => t.id);
  const label = [...document.querySelectorAll('[data-testid="pts-tab"]')].map((e) => e.textContent.trim());
  return { semua, label, adaTab: semua.includes('subagents') };
})())`, 90000);
cek('tab "subagents" terdaftar', tab.adaTab === true, tab.semua.join(', '));

// ── V2: buka tab -> view Subagents ter-render ──
const buka = await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1200));
  return {
    viewAda: !!document.querySelector('[data-testid="subagents-view"]'),
    formAda: !!document.querySelector('[data-testid="sub-form"]'),
    kosongAda: !!document.querySelector('[data-testid="sav-kosong"]'),
    angkaAda: !!document.querySelector('[data-testid="sav-angka"]'),
  };
})())`, 90000);
cek('view Subagents ter-render', buka.viewAda === true);
cek('form tugas paralel SELALU terbuka di tab ini', buka.formAda === true);
cek('empty state tampil saat belum ada subagent', buka.kosongAda === true);
cek('ringkasan angka tampil', buka.angkaAda === true);

// ── V3: panel AI TIDAK lagi memuat kartu subagent ──
const chat = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 1200));
  return {
    aiPanelAda: !!document.querySelector('.ai-panel'),
    subPanelDiChat: !!document.querySelector('.ai-panel [data-testid="sub-panel"]'),
    subBarDiChat: !!document.querySelector('.ai-panel [data-testid="sub-form"], .ai-panel [data-testid="sub-open"]'),
  };
})())`, 90000);
cek('panel AI terbuka', chat.aiPanelAda === true);
cek('kartu subagent TIDAK ada di chat lagi (tidak numpuk)', chat.subPanelDiChat === false);
cek('form tugas paralel TIDAK ada di chat', chat.subBarDiChat === false);

// ── V4: jalankan subagent -> kartu muncul di TAB, bukan di chat ──
const jalan = await cdp.json(`return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await new Promise((r) => setTimeout(r, 600));
  await window.__ZEPHYR__.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 700));
  await window.__ZEPHYR_AI__.store.getState().loadKeys();
  await new Promise((r) => setTimeout(r, 500));
  const S = window.__ZEPHYR_SUB__;
  S.bersihkan();
  await new Promise((r) => setTimeout(r, 400));
  await S.store.getState().jalankan(['Cari pemakaian fungsi App', 'Balas satu kata: DUA']);
  await new Promise((r) => setTimeout(r, 2500));
  const st = S.store.getState();
  return { n: st.agents.length, peran: st.agents.map((a) => a.peran) };
})())`, 180000);
cek('2 subagent dibuat', jalan.n === 2, `${jalan.n} agen`);
cek('peran ditebak dari kata kunci', jalan.peran[0] === 'cari', jalan.peran.join(','));

// ── V5: kartu + badge peran di tab Subagents ──
const kartu = await cdp.json(`return JSON.stringify(await (async () => {
  window.window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1400));
  const cards = [...document.querySelectorAll('[data-testid^="sub-card-"]')];
  const peran = [...document.querySelectorAll('[data-testid^="sub-peran-"]')].map((e) => ({
    teks: e.textContent.trim(),
    id: e.getAttribute('data-peran'),
    tulis: e.classList.contains('is-tulis'),
  }));
  return {
    nKartu: cards.length,
    peran,
    gridKolom: getComputedStyle(document.querySelector('.sav-root .sub-daftar') || document.body).gridTemplateColumns,
  };
})())`, 90000);
cek('kartu subagent tampil di TAB', kartu.nKartu === 2, `${kartu.nKartu} kartu`);
cek('badge peran tampil di kartu', kartu.peran.length === 2, JSON.stringify(kartu.peran));
cek('grid multi-kolom (bukan 1 kolom sempit)', (kartu.gridKolom || '').split(' ').length >= 2, kartu.gridKolom);

// ── V6: heuristik peran benar ──
const heur = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PERAN__;
  const kasus = [
    ['Cari semua pemakaian fungsi X', 'cari'],
    ['Analisis kenapa build ini gagal', 'telaah'],
    ['Buat rencana migrasi database', 'rencana'],
    ['Periksa apakah rencana ini bisa jalan', 'audit'],
    ['Perbaiki bug di modul Y', 'kerja'],
    ['Riset dokumentasi pustaka zod versi terbaru', 'jelajah'],
  ];
  const hasil = kasus.map(([t, harap]) => ({ t, dapat: P.tebak(t), harap, cocok: P.tebak(t) === harap }));
  return { hasil, salah: hasil.filter((h) => !h.cocok).map((h) => h.t) };
})())`, 90000);
cek('heuristik peran menebak 6/6 dengan benar', heur.salah.length === 0,
  heur.salah.length ? 'salah: ' + heur.salah.join(' | ') : heur.hasil.map((h) => h.dapat).join(','));

// ── V7: prefix @peran memaksa peran ──
const pref = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PERAN__;
  const a = P.prefix('@kerja perbaiki bug ini');
  const b = P.prefix('@audit cek rencana');
  const c = P.prefix('cari pemakaian');   // tanpa prefix
  return { a, b, c };
})())`, 60000);
cek('prefix @kerja dikenali', pref.a.peran === 'kerja' && pref.a.sisa === 'perbaiki bug ini', JSON.stringify(pref.a));
cek('prefix @audit dikenali', pref.b.peran === 'audit', JSON.stringify(pref.b));
cek('tanpa prefix -> null (ditebak)', pref.c.peran === null);

// ── V8: hanya peran "kerja" yang butuh tulis ──
const tulis = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PERAN__;
  const semua = P.daftar();
  return {
    n: semua.length,
    butuhTulis: semua.filter((p) => p.butuhTulis).map((p) => p.id),
    baca: semua.filter((p) => !p.butuhTulis).map((p) => p.id),
  };
})())`, 60000);
cek('6 peran tersedia', tulis.n === 6, `${tulis.n} peran`);
cek('hanya "kerja" yang butuh tulis', tulis.butuhTulis.length === 1 && tulis.butuhTulis[0] === 'kerja',
  `tulis: ${tulis.butuhTulis.join(',')} | baca: ${tulis.baca.join(',')}`);

// ── V9: shortcut Ctrl+Shift+D terdaftar ──
const sc = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SHORTCUTS__;
  if (!S) return { err: 'bridge shortcut tidak ada' };
  const a = S.ACTIONS.find((x) => x.id === 'view.subagents');
  return { ada: !!a, default: a?.default };
})())`, 60000);
cek('shortcut view.subagents terdaftar', sc.ada === true, sc.default || sc.err || '');

// ── bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
// Pastikan baseUrl mock benar-benar terpasang — kalau tidak, request pergi
// ke API asli dan uji menggantung sampai timeout.
{
  const bu = window.__ZEPHYR__.getState().settings.models.providers.gemini?.baseUrl ?? '';
  if (!bu.includes('8098')) throw new Error('baseUrl mock tidak terpasang: ' + bu);
}

  window.__ZEPHYR_SUB__.bersihkan();
  window.__ZEPHYR_TERM__.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
