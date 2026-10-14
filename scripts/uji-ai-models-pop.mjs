/**
 * uji-ai-models-pop.mjs — pop-up "AI Models" di app Zephyr yang SEDANG berjalan.
 *
 * Kenapa lewat CDP dan bukan unit test: yang diklaim bukan "komponen X
 * ter-export", melainkan "orang yang menekan tombol ini di app nyata sampai di
 * pop-up ini, dan isinya lengkap". Yang bisa putus adalah SAMBUNGANNYA (pintu ->
 * pop-up), dan sambungan hanya terbukti dengan mengklik tombol asli di DOM app
 * yang hidup lalu membaca apa yang muncul.
 *
 * Yang dibuktikan (semua dibaca dari DOM, bukan dari kode sumber):
 *   a  TIGA pintu membuka pop-up yang sama: kartu pemberitahuan 401 / tanpa API
 *      key di panel chat, dua jalur di dropdown pemilih model (empty state
 *      "No API key installed yet…" dan baris "Edit models…"), dan entri
 *      "AI Models" di menu "…". A0 adalah KONTROL: sebelum satu pun diklik,
 *      pop-up HARUS terbaca tidak ada - tanpa kontrol ini detektor yang rusak
 *      (selector salah) akan "lulus" semua pintu dan ujinya berbohong.
 *   b  Isi pop-up KOMPLIT: Active provider, AI answer language, AI answer style,
 *      Local RAG, dan TIAP kartu provider dengan API Key / Base URL / Model /
 *      Refresh / Test connection. Isi ini di-lazy-load, jadi uji menunggu sampai
 *      benar-benar ter-render - bukan menuduh gagal setelah satu tick.
 *   c  Nav Settings kiri TIDAK lagi memuat seksi "AI Models" (C0 kontrol:
 *      navnya sendiri terbaca dan memuat "General"/"About", supaya "tidak ada
 *      models" tidak bisa berarti "navnya tidak terbaca").
 *   d  Menu "…" tidak lagi memuat "Tool Sets" maupun "Show Voice Transcripts",
 *      DAN masih memuat "AI Models" (kalau ketiganya hilang, yang rusak adalah
 *      menunya, bukan dua entri yang dicabut).
 *   e  Teks lama "Open Chat Settings → Models" (dan padanan Indonesianya) tidak
 *      ada lagi di DOM mana pun - diperiksa dua keadaan: saat pop-up terbuka dan
 *      saat UI normal.
 *   f  `npx tsc --noEmit` = 0 error (dijalankan sungguhan di D:/Zephyr).
 *
 * N1-N3 adalah KONTROL NEGATIF: pelanggaran hantu disisipkan ke DOM lalu dibaca
 * dengan pembaca yang sama seperti C1/E1. Kalau pembacanya tidak menangkap hantu
 * itu, pembacanya buta dan setiap PASS di atas tidak berarti apa-apa. Hantunya
 * dihapus lagi di langkah yang sama, dan N3 membuktikan pembersihan itu berhasil.
 *
 * Harness ini mengembalikan keadaan app (provider, activity, settings, panel)
 * dan membuktikannya di Z0. Kalau di tengah jalan halaman reload (HMR akibat
 * berkas fakta diregenerasi proses lain), langkah yang gagal diulang SEKALI dan
 * kejadian itu DILAPORKAN - tidak disembunyikan, tidak dijadikan garis dasar.
 *
 *   node scripts/uji-ai-models-pop.mjs [port]     (bawaan 9223)
 *
 * Keluar != 0 kalau ada satu saja pemeriksaan yang gagal, dan 2 kalau app tidak
 * bisa disambung (BLOCKER: tidak ada pemeriksaan yang dijalankan, tidak ada yang
 * diklaim lulus).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Cdp, sleep, tungguBridge, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const SCRATCH = 'C:/Users/Zyrex/AppData/Local/hermes/cache/scratch';
const REPO = 'D:/Zephyr';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

let total = 0;
let gagal = 0;
const catatan = [];

/** PASS/FAIL per pemeriksaan; satu FAIL = proses keluar != 0. */
function cek(id, ok, detail) {
  total++;
  if (!ok) gagal++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(4)} ${detail}`);
  catatan.push({ id, ok, detail });
}

console.log(`\nuji-ai-models-pop — pop-up "AI Models" (CDP :${PORT})\n`);

/* ---------- sambung ke app yang SEDANG berjalan ---------- */

let cdp;
try {
  ({ cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']));
} catch (e) {
  console.log(`BLOKIR  tidak bisa menyambung ke CDP :${PORT} — ${e.message}`);
  console.log('        Aplikasi dev Zephyr harus sedang berjalan dengan port debug 9223.');
  console.log('        TIDAK ada satu pun pemeriksaan yang dijalankan di sini.');
  keluarBersih(2);
}

const BRIDGE = ['__ZEPHYR__', '__ZEPHYR_AI__', '__ZEPHYR_PANEL__'];
async function tungguSemuaBridge(batas = 25000) {
  for (const nama of BRIDGE) {
    const ok = await tungguBridge(cdp, nama, batas);
    if (!ok) return nama;
  }
  return null;
}

{
  const hilang = await tungguSemuaBridge(20000);
  if (hilang) {
    console.log(`BLOKIR  bridge ${hilang} tidak ada di halaman.`);
    console.log('        Halaman ini bukan Zephyr yang termuat penuh; uji dibatalkan.');
    await cdp.close();
    keluarBersih(2);
  }
}

/* Pelacak reload: HMR dari proses lain boleh mengganggu, tapi harus terlihat. */
let reloadDicurigai = 0;
const asalWaktu = await cdp.eval('performance.timeOrigin').catch(() => null);

/* ---------- pembaca keadaan halaman ---------- */

const ALAT = `
  const rect = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const gaya = (e) => { const c = getComputedStyle(e); return c.display + '/' + c.visibility + '/op' + c.opacity; };
  const tampakEl = (e) => {
    if (!e) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const c = getComputedStyle(e);
    return c.display !== 'none' && c.visibility !== 'hidden' && c.opacity !== '0';
  };
  const klik = (sel, nama) => {
    const el = q(sel);
    if (!el) throw new Error(nama + ' (' + sel + ') tidak ada di DOM');
    if (!tampakEl(el)) throw new Error(nama + ' (' + sel + ') ada tapi tidak terlihat - tidak bisa diklik pengguna');
    el.click();
    return el;
  };
  const tungguSel = async (sel, batasMs = 3000) => {
    const akhir = Date.now() + batasMs;
    for (;;) {
      const el = q(sel);
      if (el) return el;
      if (Date.now() > akhir) return null;
      await wait(150);
    }
  };
  // Menu di app ini bisa perlu satu tick React lagi sebelum muncul; menunggu
  // (bukan mengklik ulang buta) supaya klik kedua tidak justru menutupnya.
  const bukaMenuTahan = async (tombol, menu, nama) => {
    for (let i = 0; i < 2; i++) {
      if (!q(menu)) klik(tombol, nama);
      const el = await tungguSel(menu, 2500);
      if (el) return el;
    }
    throw new Error('menu ' + menu + ' tetap tidak terbuka setelah diklik 2x');
  };
  const teksDatar = (e) => (e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : '');
`;

/** Baca keadaan pop-up + isinya (dipanggil setiap selesai mengklik sebuah pintu). */
const BACA_POP = `
  ${ALAT}
  const popEl = q('[data-testid="aim-pop"]');
  const dialog = q('[data-testid="aim-pop-dialog"]');
  const isi = q('[data-testid="aim-pop-content"]');
  const kartu = qa('[data-testid="aim-pop-content"] .prov-card').map((c) => {
    const id = c.getAttribute('data-provider');
    const ada = (sel) => !!c.querySelector(sel);
    return {
      id,
      key: ada('[data-testid="prov-key-' + id + '"]'),
      url: ada('[data-testid="prov-url-' + id + '"]'),
      model: ada('[data-testid="prov-model-' + id + '"]'),
      refresh: ada('[data-testid="prov-refresh-' + id + '"]'),
      test: ada('[data-testid="prov-test-' + id + '"]'),
      badge: ada('[data-testid="prov-badge-' + id + '"]'),
      label: [...c.querySelectorAll('.prov-flabel')].map((e) => teksDatar(e)),
      tombol: [...c.querySelectorAll('button')].map((b) => teksDatar(b)).filter(Boolean),
      badgeTeks: teksDatar(c.querySelector('[data-testid="prov-badge-' + id + '"]')).slice(0, 40),
      aktif: (c.className || '').includes('is-active'),
    };
  });
  const info = (sel) => {
    const e = q('[data-testid="aim-pop-content"] ' + sel);
    if (!e) return { ada: false };
    const baris = e.closest('.set-row') || e.closest('.prov-field') || e.parentElement;
    const label = baris ? teksDatar(baris.querySelector('.set-label') || baris.querySelector('.prov-flabel')) : '';
    return { ada: true, tag: e.tagName, nilai: e.value ?? null, label: label.slice(0, 60) };
  };
  return JSON.stringify({
    ada: !!popEl,
    popTampak: tampakEl(popEl),
    popRect: popEl ? rect(popEl) : null,
    popGaya: popEl ? gaya(popEl) : null,
    dialogAda: !!dialog,
    dialogTampak: tampakEl(dialog),
    dialogRect: dialog ? rect(dialog) : null,
    ariaModal: dialog ? dialog.getAttribute('aria-modal') : null,
    ariaLabel: dialog ? dialog.getAttribute('aria-label') : null,
    tutup: !!q('[data-testid="aim-pop-close"]'),
    max: !!q('[data-testid="aim-pop-max"]'),
    isiAda: !!isi,
    isiTampak: tampakEl(isi),
    provList: !!(isi && isi.querySelector('.prov-list')),
    isiTeks: teksDatar(isi).slice(0, 220),
    jumlahKartu: kartu.length,
    kartu,
    modelsActive: info('[data-testid="models-active"]'),
    answerLang: info('[data-testid="models-answerlang"]'),
    answerStyle: info('[data-testid="models-answerstyle"]'),
    ragToggle: info('[data-testid="models-rag-toggle"]'),
    ragDiTeks: /Local RAG/i.test(teksDatar(isi)),
  });
`;

/** Tutup pop-up / menu yang mungkin terbuka, tanpa mengubah setting apa pun. */
const TUTUP_POP = `
  const backdropMenu = q('[data-testid="ai-more-backdrop"]');
  if (backdropMenu) { backdropMenu.click(); await wait(200); }
  const modelMenu = q('[data-testid="ai-model-menu"]');
  if (modelMenu) { const b = q('[data-testid="ai-model-btn"]'); if (b && tampakEl(b)) { b.click(); await wait(220); } }
  const tutup = q('[data-testid="aim-pop-close"]');
  if (tutup && tampakEl(tutup)) { tutup.click(); await wait(280); }
  if (q('[data-testid="aim-pop"]')) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(300);
  }
`;

/* ---------- keadaan awal & garis dasar ---------- */

const BACA_DASAR = `
  const st = S.getState();
  return JSON.stringify({
    activity: st.activity ?? null,
    settingsOpen: !!st.settingsOpen,
    sidebarVisible: !!st.sidebarVisible,
    termVisible: !!T.getState().visible,
    termMaximized: !!T.getState().maximized,
    aiPanelCfg: st.settings?.general?.aiPanel ?? null,
    provider: X.store.getState().provider ?? null,
    keys: (X.store.getState().keys || []).map((k) => k.provider + (k.hasKey ? ':ada' : ':kosong')),
    aiPanelAda: !!q('[data-testid="ai-panel"]'),
    aiNokeyAda: !!q('[data-testid="ai-nokey"]'),
    aimPopAda: !!q('[data-testid="aim-pop"]'),
  });
`;

const bacaDasar = async () => await cdp.json(BACA_DASAR, 25000);

const awal = await bacaDasar();
console.log(`  app     : ${await cdp.eval('document.title')} — ${await cdp.eval('location.href')}`);
console.log(`  activity: ${awal.activity}   settingsOpen: ${awal.settingsOpen}   aiPanel: ${awal.aiPanelCfg}`);
console.log(`  provider: ${awal.provider}   kunci: [${awal.keys.join(', ')}]`);
console.log(`  panel   : visible=${awal.termVisible} maximized=${awal.termMaximized}  ai-panel=${awal.aiPanelAda}\n`);

const DASAR = {
  activity: awal.activity === 'settings' || !awal.activity ? 'explorer' : awal.activity,
  settingsOpen: false,
  sidebarVisible: !!awal.sidebarVisible,
  termVisible: !!awal.termVisible,
  termMaximized: !!awal.termMaximized,
  provider: awal.provider,
};

const J = (v) => JSON.stringify(v);

const JADIKAN_DASAR = `
  ${ALAT}
  ${TUTUP_POP}
  const stR = S.getState();
  if (q('[data-testid="cset-scrim"]')) { q('[data-testid="cset-scrim"]').click(); await wait(240); }
  const tutupModal = q('[data-testid="agc-close"]');
  if (tutupModal) { tutupModal.click(); await wait(240); }
  if (stR.settingsOpen) stR.setSettingsOpen(false);
  stR.setActivity(${J(DASAR.activity)});
  S.setState({ sidebarVisible: ${J(DASAR.sidebarVisible)} });
  if (typeof T.getState().setMaximized === 'function') T.getState().setMaximized(${J(DASAR.termMaximized)});
  T.getState().setVisible(${J(DASAR.termVisible)});
  X.store.setState({ provider: ${J(DASAR.provider)} });
  await wait(380);
`;

/** Jalankan body; kalau gagal (mis. halaman reload di tengah), tunggu app siap
 *  dan ulangi SEKALI. Kejadiannya dicatat, bukan disembunyikan. */
async function jalankan(body, timeout = 40000) {
  try {
    return await cdp.runAsync(`${body}\nreturn 'ok';`, timeout);
  } catch (e) {
    reloadDicurigai++;
    console.log(`  (langkah gagal: ${e.message} — menunggu app siap lalu ulangi sekali)`);
    const hilang = await tungguSemuaBridge(20000);
    if (hilang) throw new Error(`setelah gagal, bridge ${hilang} tetap tidak ada: ${e.message}`);
    await sleep(1200);
    return await cdp.runAsync(`${body}\nreturn 'ok';`, timeout);
  }
}

async function bacaPop() {
  return await cdp.json(`${BACA_POP}`, 30000);
}

await cdp.runAsync(`${JADIKAN_DASAR} return 'ok';`, 30000).catch(() => {});

const capture = {};

/* ---------- A: tiga pintu (plus A0 kontrol) ---------- */

const p0 = await bacaPop();
capture.A0 = p0;
cek('A0', p0.ada === false && awal.aiPanelAda,
  `KONTROL - sebelum satu pun pintu diklik, pop-up AI Models TIDAK ada di DOM `
  + `(aim-pop=${p0.ada}); dan permukaan tempat pintunya berada memang ter-render (ai-panel=${awal.aiPanelAda})`);

const ringkasPop = (k) =>
  `aim-pop=${k.ada ? 'ADA' : 'tidak'} tampak=${k.popTampak} dialog=${k.dialogAda} aria-modal=${k.ariaModal} `
  + `isi=${k.isiAda} prov-list=${k.provList} kartu=${k.jumlahKartu} rect=${JSON.stringify(k.popRect)}`;

/* A1 — kartu pemberitahuan 401 / tanpa API key di panel chat. */
let a1Konteks = null;
try {
  a1Konteks = JSON.parse(await cdp.runAsync(`
    ${JADIKAN_DASAR}
    let banner = q('[data-testid="ai-nokey"]');
    if (!banner) {
      // Prasyarat kartu 401: provider aktif harus provider yang belum punya kunci.
      const st = X.store.getState();
      const tanpa = (st.keys || []).find((k) => !k.hasKey);
      if (!tanpa) throw new Error('tidak ada provider tanpa kunci untuk memaksa kartu 401 muncul');
      X.store.setState({ provider: tanpa.provider });
      await wait(600);
      banner = q('[data-testid="ai-nokey"]');
    }
    if (!banner) throw new Error('kartu pemberitahuan 401 (ai-nokey) tidak muncul di panel chat');
    const judul = teksDatar(banner);
    klik('[data-testid="ai-nokey-open"]', 'tombol di kartu 401');
    await wait(450);
    const pop = q('[data-testid="aim-pop"]');
    return JSON.stringify({
      provider: X.store.getState().provider,
      bannerTeks: judul.slice(0, 200),
      tombolTeks: teksDatar(q('[data-testid="ai-nokey-open"]')),
      popAda: !!pop,
    });
  `, 40000));
} catch (e) {
  a1Konteks = { galat: e.message };
}
await sleep(300);
const a1 = await bacaPop();
capture.A1 = { konteks: a1Konteks, pop: a1 };
cek('A1', !!a1Konteks && !a1Konteks.galat && a1.ada && a1.popTampak && a1.dialogAda && a1.tutup,
  a1Konteks?.galat
    ? `kartu 401 di panel chat: pintu TIDAK teruji — ${a1Konteks.galat}`
    : `kartu 401 (provider "${a1Konteks.provider}", tombol "${a1Konteks.tombolTeks}") membuka pop-up — ${ringkasPop(a1)}`);

/* A2 — dropdown pemilih model, empty state "No API key installed yet…". */
let a2Konteks = null;
try {
  await jalankan(`${JADIKAN_DASAR}
    await bukaMenuTahan('[data-testid="ai-model-btn"]', '[data-testid="ai-model-menu"]', 'tombol pemilih model panel chat');
    const kosong = q('[data-testid="ai-model-kosong"]');
    const grup = qa('[data-testid^="ai-model-grup-"]').map((e) => teksDatar(e));
    const tombol = kosong ? [...kosong.querySelectorAll('button')].map((b) => teksDatar(b)) : [];
    return JSON.stringify({ menu: true, kosongAda: !!kosong, kosongTeks: teksDatar(kosong).slice(0, 220), tombol, grup });
  `, 40000).then((v) => { a2Konteks = JSON.parse(v); });
} catch (e) {
  a2Konteks = { galat: e.message };
}
await sleep(300);
const a2a = await bacaPop();
if (a2Konteks && !a2Konteks.galat && a2Konteks.kosongAda) {
  try {
    const r = JSON.parse(await cdp.runAsync(`
      ${ALAT}
      const kosong = q('[data-testid="ai-model-kosong"]');
      if (!kosong) throw new Error('empty state hilang sebelum sempat diklik');
      const btn = [...kosong.querySelectorAll('button')][0];
      if (!btn) throw new Error('empty state tidak memuat satu pun tombol');
      klik('[data-testid="ai-model-kosong"] button', 'tombol di empty state "No API key installed yet"');
      await wait(450);
      return JSON.stringify({ popAda: !!q('[data-testid="aim-pop"]') });
    `, 40000));
    a2Konteks.klik = r;
  } catch (e) {
    a2Konteks.klik = { galat: e.message };
  }
}
await sleep(300);
const a2 = await bacaPop();
capture.A2 = { konteks: a2Konteks, pop: a2 };
{
  const ok = !!a2Konteks && !a2Konteks.galat && a2Konteks.kosongAda && !!a2Konteks.klik && !a2Konteks.klik.galat
    && a2.ada && a2.popTampak && a2.dialogAda;
  cek('A2', ok,
    (a2Konteks?.galat
      ? `empty state "No API key installed yet" TIDAK teruji — ${a2Konteks.galat}`
      : a2Konteks.kosongAda
        ? `empty state "No API key installed yet" (teks: "${a2Konteks.kosongTeks}", tombol: [${a2Konteks.tombol.join(' | ')}]) membuka pop-up — ${ringkasPop(a2)}`
        : `empty state "No API key installed yet" TIDAK ADA di dropdown; yang ter-render: grup=[${(a2Konteks?.grup ?? []).join(' | ')}]`));
}

/* A3 — dropdown pemilih model, baris "Edit models…". */
let a3Konteks = null;
try {
  await jalankan(`${JADIKAN_DASAR}
    await bukaMenuTahan('[data-testid="ai-model-btn"]', '[data-testid="ai-model-menu"]', 'tombol pemilih model panel chat');
    const baris = q('[data-testid="ai-model-edit"]');
    if (!baris) throw new Error('baris "Edit models…" (ai-model-edit) tidak ada di dropdown');
    const teks = teksDatar(baris);
    klik('[data-testid="ai-model-edit"]', 'baris "Edit models…"');
    await wait(450);
    return JSON.stringify({ barisTeks: teks, popAda: !!q('[data-testid="aim-pop"]') });
  `, 40000).then((v) => { a3Konteks = JSON.parse(v); });
} catch (e) {
  a3Konteks = { galat: e.message };
}
await sleep(300);
const a3 = await bacaPop();
capture.A3 = { konteks: a3Konteks, pop: a3 };
cek('A3', !!a3Konteks && !a3Konteks.galat && a3.ada && a3.popTampak && a3.dialogAda,
  a3Konteks?.galat
    ? `baris "Edit models…" TIDAK teruji — ${a3Konteks.galat}`
    : `baris "${a3Konteks.barisTeks}" (ai-model-edit) membuka pop-up — ${ringkasPop(a3)}`);

/* A4 — entri "AI Models" di menu "…" panel chat. */
let a4Konteks = null;
try {
  await jalankan(`${JADIKAN_DASAR}
    await bukaMenuTahan('[data-testid="ai-more"]', '[data-testid="ai-more-menu"]', 'tombol menu "…" panel chat');
    const entri = q('[data-testid="ai-open-models"]');
    if (!entri) throw new Error('entri "AI Models" (ai-open-models) tidak ada di menu "…"');
    const teks = teksDatar(entri);
    klik('[data-testid="ai-open-models"]', 'entri "AI Models" di menu "…"');
    await wait(500);
    return JSON.stringify({ entriTeks: teks, popAda: !!q('[data-testid="aim-pop"]') });
  `, 40000).then((v) => { a4Konteks = JSON.parse(v); });
} catch (e) {
  a4Konteks = { galat: e.message };
}
await sleep(300);
const a4 = await bacaPop();
capture.A4 = { konteks: a4Konteks, pop: a4 };
cek('A4', !!a4Konteks && !a4Konteks.galat && a4.ada && a4.popTampak && a4.dialogAda,
  a4Konteks?.galat
    ? `entri "AI Models" di menu "…" TIDAK teruji — ${a4Konteks.galat}`
    : `entri "${a4Konteks.entriTeks}" (ai-open-models) membuka pop-up — ${ringkasPop(a4)}`);

/* ---------- B: isi pop-up komplit ---------- */
/* Isi di-lazy-load (Suspense + import dinamis), jadi tunggu sampai kartu provider
   benar-benar ter-render sebelum menilai. Pop-up dari A4 dibiarkan terbuka. */

let isi = null;
{
  const deadline = Date.now() + 20000;
  for (;;) {
    const k = await bacaPop();
    isi = k;
    if (k.provList && k.jumlahKartu > 0) break;
    if (Date.now() > deadline) break;
    if (!k.ada) {
      // pop-up tertutup di tengah penantian (mis. reload) - buka lagi lewat pintu
      await jalankan(`${JADIKAN_DASAR}
        await bukaMenuTahan('[data-testid="ai-more"]', '[data-testid="ai-more-menu"]', 'tombol menu "…"');
        klik('[data-testid="ai-open-models"]', 'entri "AI Models"');
        await tungguSel('[data-testid="aim-pop"]', 3000);
      `, 40000).catch(() => {});
    }
    await sleep(700);
  }
}
capture.B_isi = isi;

const wajibBaris = [
  ['Active provider', isi.modelsActive],
  ['AI answer language', isi.answerLang],
  ['AI answer style', isi.answerStyle],
  ['Local RAG', isi.ragToggle],
];
const barisHilang = wajibBaris.filter(([, v]) => !v || !v.ada).map(([n]) => n);

cek('B1', isi.ada && isi.popTampak && isi.dialogTampak && isi.isiAda && isi.isiTampak && isi.provList,
  `kerangka pop-up lengkap & tampak (aim-pop=${isi.ada}, dialog=${isi.dialogAda} aria-modal=${isi.ariaModal} aria-label="${isi.ariaLabel}", `
  + `isi=${isi.isiAda}/${isi.isiTampak}, prov-list=${isi.provList}, tombol tutup=${isi.tutup}, maximize=${isi.max})`);

cek('B2', barisHilang.length === 0 && isi.ragDiTeks,
  (barisHilang.length
    ? `baris wajib HILANG dari isi pop-up: [${barisHilang.join(', ')}]`
    : `Active provider / AI answer language / AI answer style / Local RAG semua ada `
      + `(label terbaca: "${isi.modelsActive.label}" · "${isi.answerLang.label}" · "${isi.answerStyle.label}" · "${isi.ragToggle.label}", `
      + `teks "Local RAG" di isi=${isi.ragDiTeks})`));

{
  const kartu = isi.kartu ?? [];
  const kurang = [];
  for (const k of kartu) {
    const hilang = ['key', 'url', 'model', 'refresh', 'test', 'badge'].filter((f) => !k[f]);
    const label = k.label.join(' / ');
    const labelWajib = ['API Key', 'Base URL', 'Model'].filter((t) => !k.label.includes(t));
    const tombolWajib = [/^Refresh$/i, /Test connection/i].filter((re) => !k.tombol.some((t) => re.test(t)));
    if (hilang.length || labelWajib.length || tombolWajib.length) {
      kurang.push(`${k.id}{field=${hilang.join('+') || '-'}, label=${labelWajib.join('+') || '-'}, tombol=${tombolWajib.map(String).join('+') || '-'}}`);
    }
  }
  const labelSemua = [...new Set(kartu.flatMap((k) => k.label))];
  cek('B3', kartu.length > 0 && kurang.length === 0,
    (kartu.length === 0
      ? 'TIDAK ADA satu pun kartu provider ter-render di isi pop-up'
      : kurang.length
        ? `${kurang.length}/${kartu.length} kartu provider TIDAK lengkap: ${kurang.join('; ')}`
        : `tiap dari ${kartu.length} kartu provider memuat API Key + Base URL + Model + Refresh + Test connection `
          + `(id=${kartu.map((k) => k.id).join(',')}; label=${labelSemua.join(' / ')}; `
          + `contoh tombol ${kartu[0].id}=[${kartu[0].tombol.slice(0, 5).join(' | ')}])`));
}

/* ---------- E1: teks lama tidak ada saat pop-up terbuka ---------- */

const LAMA = ['Open Chat Settings \u2192 Models', 'Buka Pengaturan Chat \u2192 Model'];

const BACA_TEKS = `
  const klon = document.body.cloneNode(true);
  klon.querySelectorAll('script, style').forEach((e) => e.remove());
  const isiDom = (klon.textContent || '').replace(/\\s+/g, ' ');
  const tampil = (document.body.innerText || '').replace(/\\s+/g, ' ');
  return JSON.stringify({
    panjangDom: isiDom.length,
    panjangTampil: tampil.length,
    hitDom: ${J(LAMA)}.filter((t) => isiDom.includes(t)),
    hitTampil: ${J(LAMA)}.filter((t) => tampil.includes(t)),
    popTerbuka: !!q('[data-testid="aim-pop"]'),
  });
`;

/** Pembaca nav Settings kiri; dipakai fase C dan kontrol negatif. Butuh ALAT. */
const BACA_NAV = `
  const navEl = q('.set-nav');
  if (!navEl) throw new Error('nav Settings kiri (.set-nav) tidak ada');
  const btn = qa('[data-testid^="set-nav-"]');
  return JSON.stringify({
    jumlah: btn.length,
    ids: btn.map((e) => (e.getAttribute('data-testid') || '').replace('set-nav-', '')),
    teks: btn.map((e) => teksDatar(e)),
    judul: teksDatar(q('.set-nav-title')),
  });
`;

let teksBuka = null;
try {
  teksBuka = await cdp.json(BACA_TEKS, 30000);
} catch (e) {
  teksBuka = { galat: e.message };
}
capture.E1 = teksBuka;
cek('E1', !!teksBuka && !teksBuka.galat && teksBuka.hitDom.length === 0 && teksBuka.hitTampil.length === 0,
  teksBuka?.galat
    ? `pindai teks DOM saat pop-up terbuka gagal — ${teksBuka.galat}`
    : `teks lama tidak ada di DOM saat pop-up terbuka (hit di DOM=${JSON.stringify(teksBuka.hitDom)}`
      + `, di teks tampil=${JSON.stringify(teksBuka.hitTampil)}; dipindai ${teksBuka.panjangDom} char DOM / ${teksBuka.panjangTampil} char tampil)`);

/* Tutup pop-up sebelum memeriksa nav Settings & menu "…". */
await jalankan(`${JADIKAN_DASAR}`, 30000).catch(() => {});
const setelahTutup = await bacaPop();
cek('A5', setelahTutup.ada === false,
  `pop-up bisa ditutup lagi dan benar-benar hilang (aim-pop=${setelahTutup.ada} setelah klik tombol tutup)`);

/* ---------- C: nav Settings kiri tidak lagi memuat "AI Models" ---------- */

let nav = null;
try {
  nav = JSON.parse(await cdp.runAsync(`
    ${JADIKAN_DASAR}
    await bukaSet('general');
    if (!q('[data-testid="settings-page"]')) throw new Error('halaman Setelan tidak terbuka');
    ${BACA_NAV}
  `, 40000));
} catch (e) {
  nav = { galat: e.message };
}
capture.C_nav = nav;

/* C0 = kontrol: navnya sendiri terbaca dan memuat dua ujung daftar. Kalau navnya
   tidak terbaca, "tidak ada models" tidak berarti apa pun. */
cek('C0', !!nav && !nav.galat && nav.jumlah >= 5 && nav.ids.includes('general') && nav.ids.includes('about'),
  nav?.galat
    ? `KONTROL - nav Settings kiri tidak terbaca — ${nav.galat}`
    : `KONTROL - nav Settings kiri terbaca: ${nav.jumlah} seksi [${nav.ids.join(',')}] (judul "${nav.judul}")`);

cek('C1', !!nav && !nav.galat && !nav.ids.includes('models') && !nav.teks.some((t) => /AI Models|Model AI/i.test(t)),
  nav?.galat
    ? `seksi "AI Models" di nav Settings kiri tidak bisa dinilai — ${nav.galat}`
    : `nav Settings kiri TIDAK memuat seksi "AI Models" (set-nav-models=${nav.ids.includes('models') ? 'MASIH ADA' : 'tidak ada'}; `
      + `label yang ter-render=[${nav.teks.join(' | ')}])`);

/* Tutup halaman Setelan supaya menu "…" diuji dari UI normal. */
await jalankan(`${JADIKAN_DASAR}`, 30000).catch(() => {});

/* ---------- D: menu "…" tanpa Tool Sets / Show Voice Transcripts ---------- */

let menu = null;
try {
  menu = JSON.parse(await cdp.runAsync(`
    ${JADIKAN_DASAR}
    const m = await bukaMenuTahan('[data-testid="ai-more"]', '[data-testid="ai-more-menu"]', 'tombol menu "…" panel chat');
    const item = qa('[data-testid="ai-more-menu"] [data-testid]').map((e) => ({
      id: e.getAttribute('data-testid'),
      teks: teksDatar(e),
    }));
    const semuaTeks = teksDatar(m);
    const tetap = { toolsets: semuaTeks.includes('Tool Sets'), voice: semuaTeks.includes('Show Voice Transcripts') };
    const backdrop = q('[data-testid="ai-more-backdrop"]');
    if (backdrop) { backdrop.click(); await wait(220); }
    return JSON.stringify({ jumlah: item.length, item, tetap });
  `, 40000));
} catch (e) {
  menu = { galat: e.message };
}
capture.D_menu = menu;

cek('D0', !!menu && !menu.galat && menu.jumlah >= 4,
  menu?.galat
    ? `KONTROL - menu "…" tidak terbaca — ${menu.galat}`
    : `KONTROL - menu "…" terbaca: ${menu.jumlah} entri [${(menu.item ?? []).map((i) => i.id).join(',')}]`);

cek('D1', !!menu && !menu.galat
  && !menu.item.some((i) => i.id === 'ai-open-toolsets')
  && !menu.item.some((i) => i.id === 'ai-voice-transcripts')
  && !menu.item.some((i) => /tool sets|voice transcripts/i.test(i.teks)),
  menu?.galat
    ? `entri menu "…" tidak bisa dinilai — ${menu.galat}`
    : `entri "Tool Sets" (ai-open-toolsets) dan "Show Voice Transcripts" (ai-voice-transcripts) TIDAK ada lagi di menu "…" `
      + `(sisa teks menu memuat "Tool Sets"=${menu.tetap?.toolsets}, "Show Voice Transcripts"=${menu.tetap?.voice}); `
      + `entri yang ada=[${(menu.item ?? []).map((i) => `${i.id}:"${i.teks}"`).join(' | ')}]`);

cek('D2', !!menu && !menu.galat && menu.item.some((i) => i.id === 'ai-open-models' && /AI Models/i.test(i.teks)),
  `menu "…" MASIH memuat entri "AI Models" (ai-open-models) — `
  + `opsi ini TIDAK ikut hilang bersama dua entri yang dicabut`);

/* ---------- E2: teks lama tidak ada di UI normal ---------- */

let teksNormal = null;
try {
  teksNormal = await cdp.json(BACA_TEKS, 30000);
} catch (e) {
  teksNormal = { galat: e.message };
}
capture.E2 = teksNormal;
cek('E2', !!teksNormal && !teksNormal.galat && teksNormal.hitDom.length === 0 && teksNormal.hitTampil.length === 0,
  teksNormal?.galat
    ? `pindai teks DOM pada UI normal gagal — ${teksNormal.galat}`
    : `teks lama tidak ada di DOM pada UI normal (hit di DOM=${JSON.stringify(teksNormal.hitDom)}, `
      + `di teks tampil=${JSON.stringify(teksNormal.hitTampil)}; pop-up terbuka=${teksNormal.popTerbuka})`);

/* ---------- NEG: kontrol negatif — pembuktian bahwa pemeriksaan BISA gagal ---------- */
/* Menyisipkan pelanggaran hantu ke DOM (satu item nav `set-nav-models` + satu teks
   "Open Chat Settings → Models"), lalu membaca ulang dengan pembaca yang SAMA
   seperti fase C/E. Kalau pembacanya tidak menangkap hantu itu, pembaca itu buta
   dan semua PASS di atas tidak berarti. Hantu dihapus lagi di dalam langkah yang
   sama (try/finally), jadi app tidak ditinggalkan termodifikasi. */

let neg = null;
try {
  neg = JSON.parse(await cdp.runAsync(`
    ${JADIKAN_DASAR}
    await bukaSet('general');
    if (!q('.set-nav')) throw new Error('nav Settings kiri tidak ada untuk dikotori');
    let navKotor = null, teksKotor = null, navBersih = null, teksBersih = null;
    const hantuNav = document.createElement('button');
    hantuNav.setAttribute('data-testid', 'set-nav-models');
    hantuNav.textContent = 'AI Models';
    const hantuTeks = document.createElement('span');
    hantuTeks.textContent = 'Open Chat Settings \u2192 Models';
    try {
      q('.set-nav').appendChild(hantuNav);
      document.body.appendChild(hantuTeks);
      await wait(150);
      navKotor = JSON.parse((() => { ${BACA_NAV} })());
      teksKotor = JSON.parse((() => { ${BACA_TEKS} })());
    } finally {
      hantuNav.remove();
      hantuTeks.remove();
      await wait(200);
    }
    navBersih = JSON.parse((() => { ${BACA_NAV} })());
    teksBersih = JSON.parse((() => { ${BACA_TEKS} })());
    return JSON.stringify({ navKotor, teksKotor, navBersih, teksBersih });
  `, 40000));
} catch (e) {
  neg = { galat: e.message };
}
capture.NEG = neg;

cek('N1', !!neg && !neg.galat && neg.navKotor.ids.includes('models') && neg.navKotor.teks.some((t) => /AI Models/i.test(t)),
  neg?.galat
    ? `kontrol negatif nav gagal dijalankan — ${neg.galat}`
    : `pembaca nav fase C memang BISA gagal: setelah hantu "set-nav-models" disisipkan, id terbaca=[${neg.navKotor.ids.join(',')}] `
      + `dan label memuat "AI Models" - kondisi yang persis ditolak oleh C1`);

cek('N2', !!neg && !neg.galat && neg.teksKotor.hitDom.length > 0 && neg.teksKotor.hitTampil.length > 0,
  neg?.galat
    ? `kontrol negatif pindai teks gagal dijalankan — ${neg.galat}`
    : `pembaca teks fase E memang BISA gagal: setelah teks lama disisipkan, tertangkap di DOM=${JSON.stringify(neg.teksKotor.hitDom)} `
      + `dan di teks tampil=${JSON.stringify(neg.teksKotor.hitTampil)}`);

cek('N3', !!neg && !neg.galat && !neg.navBersih.ids.includes('models') && neg.teksBersih.hitDom.length === 0
  && neg.teksBersih.popTerbuka === false,
  neg?.galat
    ? `pembersihan setelah kontrol negatif tidak bisa dinilai — ${neg.galat}`
    : `setelah hantu dihapus, dua pembaca kembali bersih (set-nav-models=${neg.navBersih.ids.includes('models') ? 'MASIH ADA' : 'tidak ada'}, `
      + `hit teks=${JSON.stringify(neg.teksBersih.hitDom)}) - app tidak ditinggalkan termodifikasi`);

/* ---------- F: npx tsc --noEmit ---------- */

{
  console.log('\n  menjalankan `npx tsc --noEmit --pretty false` di ' + REPO + ' (bisa 1-2 menit)…');
  const t0 = Date.now();
  const r = spawnSync('npx tsc --noEmit --pretty false', {
    cwd: REPO,
    shell: true,
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const keluaran = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const barisGalat = keluaran.split(/\r?\n/).filter((l) => /\berror TS\d+/.test(l));
  capture.F_tsc = {
    status: r.status,
    signal: r.signal ?? null,
    galatDihitung: barisGalat.length,
    contohGalat: barisGalat.slice(0, 10),
    panjangKeluaran: keluaran.length,
    ms: Date.now() - t0,
  };
  cek('F1', r.status === 0 && barisGalat.length === 0,
    r.status === 0 && barisGalat.length === 0
      ? `npx tsc --noEmit = 0 error (exit=${r.status}, ${Math.round((Date.now() - t0) / 1000)}s)`
      : `npx tsc --noEmit GAGAL (exit=${r.status}, ${barisGalat.length} baris "error TS…")`
        + ` contoh: ${barisGalat.slice(0, 3).join(' || ') || '(tidak ada baris error terbaca)'}`);
}

/* ---------- Z0: keadaan app dikembalikan ---------- */

{
  await cdp.runAsync(`${JADIKAN_DASAR} return 'ok';`, 30000).catch(() => {});
  const k = await bacaDasar();
  const popAkhir = await bacaPop();
  capture.Z0 = { dasar: k, pop: popAkhir };
  const asalSekarang = await cdp.eval('performance.timeOrigin').catch(() => null);
  const direload = asalSekarang !== asalWaktu;
  cek('Z0', k.activity === DASAR.activity && !k.settingsOpen && !popAkhir.ada && k.aiPanelAda,
    `keadaan app dikembalikan (activity=${k.activity} [dasar ${DASAR.activity}], settingsOpen=${k.settingsOpen}, `
    + `provider=${k.provider} [dasar ${DASAR.provider}], panel visible=${k.termVisible}, aim-pop=${popAkhir.ada}, ai-panel=${k.aiPanelAda}; `
    + `halaman reload di tengah uji=${direload ? 'YA' : 'tidak'}, langkah yang harus diulang=${reloadDicurigai})`);
}

/* ---------- laporan ---------- */

await cdp.close();

const laporan = {
  ketika: new Date().toISOString(),
  port: PORT,
  app: { judul: 'Zephyr — Code Editor', url: 'http://localhost:5173/' },
  dasar: DASAR,
  awal,
  reloadDicurigai,
  lulus: total - gagal,
  total,
  catatan,
  capture,
};

try {
  const berkas = `${SCRATCH}/uji-ai-models-pop-${STAMP}.json`;
  writeFileSync(berkas, JSON.stringify(laporan, null, 2), 'utf8');
  console.log(`\n  bukti mentah: ${berkas}`);
} catch (e) {
  console.log(`\n  (gagal menulis berkas bukti: ${e.message})`);
}

console.log(`\n== ${total - gagal}/${total} PASS ==`);
if (gagal) console.log(`   ${gagal} pemeriksaan GAGAL — lihat baris FAIL di atas dan bukti mentahnya.`);
keluarBersih(gagal ? 1 : 0);
