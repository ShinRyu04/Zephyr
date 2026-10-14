/**
 * uji-set-pindah.mjs — "setelan yang sudah PINDAH ke Chat Settings tidak lagi
 * membuka halaman Setelan lama di area editor", diuji pada app yang
 * BENAR-BENAR berjalan lewat CDP. Bukan unit test: yang diklik adalah tombol
 * asli di DOM, dan yang dibaca adalah store asli app.
 *
 * Kenapa lewat CDP: keluhannya bukan "fungsi X salah", melainkan "kontrol ini
 * masih membawa saya ke halaman yang salah". Yang bisa salah adalah
 * SAMBUNGANNYA (tombol -> pintu), dan itu hanya terbukti dengan mengklik tombol
 * itu di app nyata lalu membaca pembaca mendarat di mana.
 *
 * Yang dibuktikan:
 *   A  Tiga pintu menuju setelan model (provider/kunci API/base URL/daftar
 *      model) mendarat di POP-UP "AI Models" (`aim-pop`) - bukan lagi di Chat
 *      Settings dan bukan di halaman Setelan area editor. Pintunya: banner
 *      kunci di panel chat (ai-nokey-open), pemilih model panel chat
 *      (ai-model-btn -> ai-model-edit), pemilih model header subagent
 *      (sub-model-btn -> sub-model-edit). Pintu menu "…" -> "AI Models"
 *      (ai-open-models) diperiksa di E1. Pintu lain: baris Chat Settings di
 *      menu "…" tetap ke Chat Settings (A2); baris izin-tulis subagent tetap ke
 *      Chat Settings Sub-agents (A5); baris personas tetap ke Agent
 *      Customizations (A6, permukaan sendiri yang BUKAN halaman Setelan).
 *      A0 adalah KONTROL: halaman Setelan lama sengaja dibuka lewat helper
 *      `bukaSet()` milik lib-cdp. Tanpa kontrol ini, pendeteksi yang rusak
 *      (selector salah) akan "lulus" semua pintu dan ujinya bohong.
 *   B  Pop-up AI Models benar-benar memuat BADAN ModelsSection: baris provider
 *      (kunci API/base URL/model + Refresh/Test) dan baris Active provider /
 *      bahasa jawaban / gaya jawaban. Inilah bukti bahwa setelan yang dulu jadi
 *      baris Chat Settings (cset-row-keys|askmodel|provider2|baseurl) memang
 *      PINDAH ke sini, bukan hilang tanpa jejak.
 *   C  Pintu dari tampilan subagent mendarat di seksi SUB-AGENTS.
 *   D  Daftar tab panel bawah TIDAK memuat tab AI, DAN kolom chat di kanan
 *      tetap merender panel AI (jadi pindahnya bukan "AI-nya ikut pindah").
 *   E  Menu "…" panel chat: entri "Tool Sets" (ai-open-toolsets) dan "Show
 *      Voice Transcripts" (ai-voice-transcripts) sudah TIDAK ada, dan entri
 *      baru "AI Models" (ai-open-models) ada (E1); nav Settings kiri (set-nav-*)
 *      tidak lagi memuat seksi AI Models (set-nav-models) (E2); seksi Models di
 *      Chat Settings kini hanya berisi baris HydraFusion (E3).
 *
 * Skrip ini mengembalikan keadaan app seperti semula (activity, sidebar, panel,
 * provider) dan membuktikannya di Z0. Kalau app ternyata ditinggalkan dalam
 * keadaan kotor oleh uji sebelumnya, itu dilaporkan di awal - bukan
 * disembunyikan, dan bukan dijadikan garis dasar.
 *
 *   node scripts/uji-set-pindah.mjs [port]     (bawaan 9223)
 *
 * Keluar != 0 kalau ada satu saja pemeriksaan yang gagal, dan 2 kalau app tidak
 * bisa disambung (BLOCKER: tidak ada pemeriksaan yang dijalankan, tidak ada yang
 * diklaim lulus).
 */
import { writeFileSync } from 'node:fs';
import { Cdp, sleep, tungguBridge, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const SCRATCH = 'D:/Zephyr/scratch';
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

console.log(`\nuji-set-pindah — setelan yang pindah ke Chat Settings (CDP :${PORT})\n`);

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

for (const nama of ['__ZEPHYR__', '__ZEPHYR_AI__', '__ZEPHYR_PANEL__']) {
  try {
    await tungguBridge(cdp, nama, 15000);
  } catch (e) {
    console.log(`BLOKIR  bridge ${nama} tidak ada di halaman — ${e.message}`);
    console.log('        Halaman ini bukan Zephyr yang sudah termuat penuh; uji dibatalkan.');
    await cdp.close();
    keluarBersih(2);
  }
}

/* ---------- pembaca keadaan halaman ---------- */

const BACA = `
  const st = S.getState();
  const aiSt = X.store.getState();
  const ada = (s) => !!q(s);
  // offsetParent NULL untuk elemen ber-position:fixed (mis. aim-pop) walau benar-benar tampak,
  // jadi pakai ukuran rect + display/visibility - tetap GAGAL kalau disembunyikan.
  const tampak = (s) => {
    const e = q(s);
    if (!e) return false;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const g = getComputedStyle(e);
    return g.visibility !== 'hidden' && g.display !== 'none';
  };
  const nav = qa('[data-testid^="cset-nav-"]').find((e) => e.getAttribute('aria-current') === 'true');
  const badan = q('[data-testid="panel-body"]');
  const aiEl = q('[data-testid="ai-panel"]');
  const kotak = aiEl ? aiEl.getBoundingClientRect() : null;
  const tabUser = q('[data-testid="cset-scope-user"]');
  return JSON.stringify({
    activity: st.activity ?? null,
    settingsOpen: !!st.settingsOpen,
    sidebarVisible: !!st.sidebarVisible,
    termVisible: !!T.getState().visible,
    termMaximized: !!T.getState().maximized,
    aiPanelCfg: st.settings?.general?.aiPanel ?? null,
    provider: aiSt.provider ?? null,
    setPage: ada('[data-testid="settings-page"]'),
    setTopbar: ada('.set-topbar'),
    cset: ada('[data-testid="cset-page"]'),
    csetTampak: tampak('[data-testid="cset-page"]'),
    csetJudul: qa('[data-testid="cset-page"] .set-h2').map((e) => e.textContent.trim()),
    navAktif: nav ? nav.getAttribute('data-testid') : null,
    baris: qa('[data-testid^="cset-row-"]').map((e) => e.getAttribute('data-testid')),
    scopeUser: tabUser ? tabUser.getAttribute('aria-selected') : null,
    agc: ada('[data-testid="agent-custom"]'),
    aim: ada('[data-testid="aim-pop"]'),
    aimTampak: tampak('[data-testid="aim-pop"]'),
    aimDialog: ada('[data-testid="aim-pop-dialog"]'),
    aimContent: ada('[data-testid="aim-pop-content"]'),
    aimClose: ada('[data-testid="aim-pop-close"]'),
    aimKartu: qa('[data-testid^="prov-"]').map((e) => e.getAttribute('data-testid')),
    aimModelAktif: ada('[data-testid="models-active"]'),
    aimJawabLang: ada('[data-testid="models-answerlang"]'),
    setNavIds: qa('[data-testid^="set-nav-"]').map((e) => e.getAttribute('data-testid')),
    setNavModels: ada('[data-testid="set-nav-models"]'),
    aiPanel: !!aiEl,
    aiTampak: tampak('[data-testid="ai-panel"]'),
    aiDalamPanel: !!(badan && aiEl && badan.contains(aiEl)),
    aiRect: kotak ? { x: Math.round(kotak.left), lebar: Math.round(kotak.width) } : null,
    layar: window.innerWidth,
    aiChat: ada('[data-testid="ai-chat"]'),
    aiHost: ada('[data-testid="ai-host"]'),
  });
`;

const baca = async () => await cdp.json(BACA, 30000);
const J = (v) => JSON.stringify(v);

/* ---------- keadaan awal & garis dasar ---------- */

const awal = await baca();
console.log(`  app     : ${await cdp.eval('document.title')} — ${await cdp.eval('location.href')}`);
console.log(`  activity: ${awal.activity}   settingsOpen: ${awal.settingsOpen}   aiPanel: ${awal.aiPanelCfg}`);
console.log(`  panel   : visible=${awal.termVisible} maximized=${awal.termMaximized}  provider=${awal.provider}\n`);

if (awal.activity === 'settings' || awal.settingsOpen || awal.setPage) {
  console.log(`  CATATAN keadaan awal KOTOR: app sedang berada di halaman Setelan lama`
    + ` (activity=${awal.activity}, settingsOpen=${awal.settingsOpen}, settings-page=${awal.setPage}).`);
  console.log('          Uji ini menutupnya lebih dulu supaya garis dasarnya bersih; keadaan akhir dilaporkan di Z0.\n');
}

/* Garis dasar = keadaan "netral" yang dipasang ulang sebelum tiap pintu diuji.
   'settings' TIDAK PERNAH boleh jadi garis dasar: kalau app ditinggal di sana,
   tiap pintu akan tampak "membuka Setelan lama" padahal itu sisa uji sebelumnya
   (persis inilah yang pernah menipu sekali saat skrip ini disusun). */
const DASAR = {
  activity: awal.activity === 'settings' || !awal.activity ? 'explorer' : awal.activity,
  settingsOpen: false,
  sidebarVisible: !!awal.sidebarVisible,
  termVisible: !!awal.termVisible,
  termMaximized: !!awal.termMaximized,
  provider: awal.provider,
};

const JADIKAN_DASAR = `
  const stR = S.getState();
  const scrim = q('[data-testid="cset-scrim"]');
  if (scrim) { scrim.click(); await wait(240); }
  const tutupModal = q('[data-testid="agc-close"]');
  if (tutupModal) { tutupModal.click(); await wait(240); }
  const tutupAim = q('[data-testid="aim-pop-close"]');
  if (tutupAim) { tutupAim.click(); await wait(240); }
  if (stR.settingsOpen) stR.setSettingsOpen(false);
  stR.setActivity(${J(DASAR.activity)});
  S.setState({ sidebarVisible: ${J(DASAR.sidebarVisible)} });
  if (typeof T.getState().setMaximized === 'function') T.getState().setMaximized(${J(DASAR.termMaximized)});
  T.getState().setVisible(${J(DASAR.termVisible)});
  X.store.setState({ provider: ${J(DASAR.provider)} });
  await wait(340);
`;

/** Klik yang jujur: elemen harus ADA dan TAMPAK - seperti yang bisa diklik orang. */
const ALAT = `
  const klik = (sel, nama) => {
    const el = q(sel);
    if (!el) throw new Error(nama + ' (' + sel + ') tidak ada di DOM');
    if (el.offsetParent === null) throw new Error(nama + ' (' + sel + ') ada tapi tidak tampak - tidak bisa diklik pengguna');
    el.click();
    return el;
  };
`;

/** Kalau halaman Chat Settings memakai scope Workspace, pindah ke User. */
const EKOR_SCOPE = `
  await wait(240);
  const tbUser = q('[data-testid="cset-scope-user"]');
  if (tbUser && tbUser.getAttribute('aria-selected') !== 'true') { tbUser.click(); await wait(300); }
`;

/** Ringkasan satu tangkapan keadaan, untuk baris PASS/FAIL. */
const ringkas = (k) =>
  `setelanLama=${k.setPage ? 'TERBUKA' : 'tidak'} activity=${k.activity} settingsOpen=${k.settingsOpen}`
  + ` | cset=${k.cset ? 'terbuka' : 'tidak'} aim=${k.aim ? 'terbuka' : 'tidak'} seksi=${k.navAktif ?? '-'} baris=[${(k.baris ?? []).join(',')}]`
  + (k.agc ? ' | agent-custom=terbuka' : '');

const capture = {};

/* ---------- P: prasyarat ---------- */

let dasarTerpasang = false;
try {
  await cdp.runAsync(`${JADIKAN_DASAR} return 'ok';`, 25000);
  dasarTerpasang = true;
} catch (e) {
  console.log(`  (garis dasar gagal dipasang: ${e.message})`);
}

const kP = await baca();

cek('P0', kP.aiPanel && kP.aiTampak && kP.aiChat && kP.aiHost,
  `permukaan AI ada dan tampak (ai-panel=${kP.aiPanel}, tampak=${kP.aiTampak}, ai-chat=${kP.aiChat}, `
  + `ai-host=${kP.aiHost}, kolom ${kP.aiPanelCfg})`);

cek('P1', dasarTerpasang && !kP.setPage && kP.activity === DASAR.activity && !kP.settingsOpen,
  `garis dasar bersih sebelum uji: halaman Setelan lama TIDAK terbuka (settings-page=${kP.setPage}, `
  + `activity=${kP.activity} [dasar ${DASAR.activity}], settingsOpen=${kP.settingsOpen})`);

/* P2: di permukaan AI tidak boleh tersisa kontrol bernama lama (yang dulu
   membuka halaman Setelan). */
{
  const kunci = await cdp.json(`
    const dalam = qa('[data-testid="ai-panel"] [data-testid], [data-testid="ai-host"] [data-testid]');
    const nama = [...new Set(dalam.map((e) => e.getAttribute('data-testid')))];
    return JSON.stringify({
      jumlah: nama.length,
      mencurigakan: nama.filter((t) => /settings-page|open-settings|buka-settings|^set-page$/.test(t)),
      berbau: nama.filter((t) => /settings|setelan/i.test(t)),
    });
  `, 25000);

  cek('P2', kunci.mencurigakan.length === 0,
    `tidak ada kontrol bernama lama (settings-page/open-settings) di permukaan AI `
    + `(dari ${kunci.jumlah} testid; yang berbau "settings/setelan": [${kunci.berbau.join(',') || '-'}]`
    + `${kunci.mencurigakan.length ? `; MENDUGA: [${kunci.mencurigakan.join(',')}]` : ''})`);
}

/* ---------- A0: KONTROL pendeteksi ---------- */

{
  const asli = await cdp.json(`
    await bukaSet();
    return JSON.stringify({
      page: !!q('[data-testid="settings-page"]'),
      topbar: !!q('.set-topbar'),
      activity: S.getState().activity,
      settingsOpen: !!S.getState().settingsOpen,
    });
  `, 30000);

  cek('A0', asli.page && asli.activity === 'settings',
    `KONTROL - halaman Setelan lama memang terdeteksi saat sengaja dibuka lewat bukaSet() `
    + `(settings-page=${asli.page}, topbar=${asli.topbar}, activity=${asli.activity}, settingsOpen=${asli.settingsOpen})`);

  await cdp.runAsync(`${JADIKAN_DASAR} return 'ok';`, 25000);
}

/* ---------- pintu-pintu permukaan AI ---------- */

const PINTU = [
  {
    id: 'A1',
    nama: 'banner kunci di panel chat (ai-nokey-open)',
    aksi: `
      const st1 = X.store;
      const semula = st1.getState().provider;
      const tanpaKunci = (st1.getState().keys || []).find((k) => !k.hasKey);
      if (!tanpaKunci) throw new Error('tidak ada provider tanpa kunci untuk memaksa banner muncul');
      st1.setState({ provider: tanpaKunci.provider });
      await wait(450);
      klik('[data-testid="ai-nokey-open"]', 'tautan banner kunci');
      await wait(200);
      st1.setState({ provider: semula });
      ${EKOR_SCOPE}
    `,
    tepat: (k) => k.aim === true,
    tujuan: 'pop-up AI Models terbuka (isinya diperiksa di B)',
  },
  {
    id: 'A2',
    nama: 'menu "…" panel chat (ai-open-chat-settings)',
    aksi: `
      klik('[data-testid="ai-more"]', 'tombol menu "…"');
      await wait(400);
      klik('[data-testid="ai-open-chat-settings"]', 'baris Chat Settings di menu "…"');
      ${EKOR_SCOPE}
    `,
    tepat: (k) => k.cset,
    tujuan: 'Chat Settings terbuka (seksi bawaan, tanpa target)',
  },
  {
    id: 'A3',
    nama: 'pemilih model panel chat (ai-model-edit)',
    aksi: `
      klik('[data-testid="ai-model-btn"]', 'tombol model panel chat');
      await wait(420);
      klik('[data-testid="ai-model-edit"]', 'baris "Edit models"');
      ${EKOR_SCOPE}
    `,
    tepat: (k) => k.aim === true,
    tujuan: 'pop-up AI Models (bukan lagi seksi Models di Chat Settings)',
  },
  {
    id: 'A4',
    nama: 'pemilih model header subagent (sub-model-edit)',
    aksi: `
      window.__ZEPHYR_PANEL__.focusTab('subagents');
      await wait(550);
      klik('[data-testid="sub-model-btn"]', 'pemilih model subagent');
      await wait(420);
      klik('[data-testid="sub-model-edit"]', 'baris "Edit models" (subagent)');
      ${EKOR_SCOPE}
    `,
    tepat: (k) => k.aim === true,
    tujuan: 'pop-up AI Models (bukan lagi seksi Models di Chat Settings)',
  },
  {
    id: 'A5',
    nama: 'baris izin-tulis di tampilan subagent (sav-tulis-setelan)',
    aksi: `
      window.__ZEPHYR_PANEL__.focusTab('subagents');
      await wait(550);
      klik('[data-testid="sav-tulis-setelan"]', 'tombol izin-tulis subagent');
      ${EKOR_SCOPE}
    `,
    tepat: (k) => k.cset && k.baris.includes('cset-row-subwrite'),
    tujuan: 'Chat Settings pada seksi Sub-agents',
  },
  {
    id: 'A6',
    nama: 'baris personas di menu mode (ai-mode-manage)',
    aksi: `
      klik('[data-testid="ai-mode-menu"]', 'tombol menu mode');
      await wait(420);
      klik('[data-testid="ai-mode-manage"]', 'baris personas di menu mode');
      await wait(320);
    `,
    /* Pintu ini SENGAJA tidak menuju Chat Settings: personas diedit di Agent
       Customizations. Yang sama-sama diuji: ia tidak boleh membawa pembaca ke
       halaman Setelan area editor. Modal dibiarkan terbuka agar bisa dibaca,
       lalu ditutup oleh JADIKAN_DASAR pada pintu/langkah berikutnya. */
    tepat: (k) => k.agc === true,
    tujuan: 'Agent Customizations (bukan halaman Setelan)',
  },
];

for (const p of PINTU) {
  let galat = null;
  try {
    await cdp.runAsync(`${ALAT}\n${JADIKAN_DASAR}\n${p.aksi}\nreturn 'ok';`, 40000);
  } catch (e) {
    galat = e.message;
  }
  await sleep(300);
  const k = await baca();
  capture[p.id] = k;

  if (galat) {
    const bersih = !k.setPage && !k.settingsOpen && k.activity !== 'settings';
    cek(p.id, false, `${p.nama}: langkah klik gagal — ${galat}`
      + (bersih ? ' (halaman Setelan lama tetap tidak terbuka)' : ' (PERHATIAN: halaman Setelan lama terbuka)'));
    continue;
  }

  const okLama = !k.setPage && !k.setTopbar && !k.settingsOpen && k.activity !== 'settings';
  const okTepat = p.tepat(k);

  if (!okLama) {
    cek(p.id, false, `${p.nama}: MEMBUKA HALAMAN SETELAN LAMA (setPage=${k.setPage}, topbar=${k.setTopbar}, `
      + `activity=${k.activity}, settingsOpen=${k.settingsOpen}) — seharusnya: ${p.tujuan}`);
  } else if (!okTepat) {
    cek(p.id, false, `${p.nama}: halaman Setelan lama tidak terbuka, TAPI tujuan tidak sesuai (${p.tujuan}) — ${ringkas(k)}`);
  } else {
    cek(p.id, true, `${p.nama}: TIDAK membuka halaman Setelan lama; mendarat di ${p.tujuan} — ${ringkas(k)}`);
  }
}

/* ---------- B: pintu banner kunci -> pop-up AI Models + isinya ---------- */

{
  /* Pintu banner kunci diulang di sini (bukan memakai tangkapan A1) karena
     pop-up sudah ditutup oleh JADIKAN_DASAR milik pintu/langkah berikutnya. */
  let isi = null;
  try {
    isi = await cdp.json(`
      ${ALAT}
      ${JADIKAN_DASAR}
      const st1 = X.store;
      const semula = st1.getState().provider;
      const tanpaKunci = (st1.getState().keys || []).find((k) => !k.hasKey);
      if (!tanpaKunci) throw new Error('tidak ada provider tanpa kunci untuk memaksa banner muncul');
      st1.setState({ provider: tanpaKunci.provider });
      await wait(450);
      klik('[data-testid="ai-nokey-open"]', 'tautan banner kunci');
      st1.setState({ provider: semula });
      /* Badan ModelsSection di dalam pop-up di-load malas: tunggu sampai baris
         Active provider benar-benar terender sebelum membaca isinya. */
      for (let i = 0; i < 40; i++) {
        if (q('[data-testid="aim-pop-content"] [data-testid="models-active"]')) break;
        await wait(200);
      }
      const akar = q('[data-testid="aim-pop"]');
      const kartu = qa('[data-testid^="prov-"]').map((e) => e.getAttribute('data-testid'));
      return JSON.stringify({
        // offsetParent NULL untuk elemen ber-position:fixed (mis. aim-pop) walau benar-benar tampak.
        tampak: (() => {
          if (!akar) return false;
          const r = akar.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const g = getComputedStyle(akar);
          return g.display !== 'none' && g.visibility !== 'hidden';
        })(),
        dialog: !!q('[data-testid="aim-pop-dialog"]'),
        content: !!q('[data-testid="aim-pop-content"]'),
        tutup: !!q('[data-testid="aim-pop-close"]'),
        modelAktif: !!q('[data-testid="models-active"]'),
        jawabLang: !!q('[data-testid="models-answerlang"]'),
        jawabGaya: !!q('[data-testid="models-answerstyle"]'),
        kartu,
      });
    `, 45000);
  } catch (e) {
    cek('B', false, `banner kunci TIDAK membuka pop-up AI Models / isinya tidak terbaca — ${e.message}`);
  }

  if (isi) {
    const kunci = (isi.kartu ?? []).filter((t) => /^prov-key-/.test(t));
    const url = (isi.kartu ?? []).filter((t) => /^prov-url-/.test(t));
    const refresh = (isi.kartu ?? []).filter((t) => /^prov-refresh-/.test(t));
    const test = (isi.kartu ?? []).filter((t) => /^prov-test-/.test(t));
    const ok = isi.tampak && isi.dialog && isi.content && isi.tutup
      && isi.modelAktif && isi.jawabLang && isi.jawabGaya
      && kunci.length > 0 && url.length > 0 && refresh.length > 0 && test.length > 0;
    cek('B', ok,
      `banner kunci mendarat di POP-UP AI Models yang memuat BADAN ModelsSection `
      + `(tampak=${isi.tampak}, dialog=${isi.dialog}, content=${isi.content}, tombol tutup=${isi.tutup}; `
      + `Active provider=${isi.modelAktif}, bahasa jawaban=${isi.jawabLang}, gaya jawaban=${isi.jawabGaya}; `
      + `baris prov-key=[${kunci.join(',')}], prov-url=[${url.join(',')}], prov-refresh=${refresh.length}x, prov-test=${test.length}x) `
      + `- setelan yang dulu jadi cset-row-keys|askmodel|provider2|baseurl memang PINDAH ke sini`);
  }
}

/* ---------- C: pintu subagent -> seksi Sub-agents ---------- */

{
  const k = capture.A5 ?? {};
  const ok = !!k.csetTampak && k.navAktif === 'cset-nav-subagent' && (k.baris ?? []).includes('cset-row-subwrite');
  cek('C', ok,
    `baris subagent mendarat di seksi Sub-agents (akar halaman tampak=${k.csetTampak}, nav aktif=${k.navAktif}, `
    + `baris=[${(k.baris ?? []).join(',')}], judul=[${(k.csetJudul ?? []).join(' | ')}])`);
}

/* ---------- E: menu "…", nav Settings, isi seksi Models Chat Settings ---------- */

/* E1 - menu "…" panel chat: entri "AI Models" (ai-open-models) ada; "Tool Sets"
   (ai-open-toolsets) dan "Show Voice Transcripts" (ai-voice-transcripts) sudah
   TIDAK ada. Dibaca dari DOM menu yang benar-benar dibuka, bukan dari daftar di
   kode, supaya buktinya nyata. */
{
  const menu = await cdp.json(`
    ${ALAT}
    ${JADIKAN_DASAR}
    klik('[data-testid="ai-more"]', 'tombol menu "…"');
    await wait(500);
    const adaMenu = q('[data-testid="ai-more-menu"]');
    const items = qa('[data-testid="ai-more-menu"] [data-testid]').map((e) => e.getAttribute('data-testid'));
    const backdrop = q('.ai-more-backdrop');
    if (backdrop) { backdrop.click(); await wait(220); }
    return JSON.stringify({ adaMenu: !!adaMenu, items });
  `, 30000);
  capture.E1 = menu;

  const ada = (t) => (menu.items ?? []).includes(t);
  const ok = !!menu.adaMenu
    && ada('ai-open-models')
    && ada('ai-open-chat-settings')
    && !ada('ai-open-toolsets')
    && !ada('ai-voice-transcripts');
  cek('E1', ok,
    `menu "…" memuat "AI Models" (ai-open-models) dan TIDAK LAGI memuat "Tool Sets" `
    + `(ai-open-toolsets) + "Show Voice Transcripts" (ai-voice-transcripts) `
    + `- entri=[${(menu.items ?? []).join(',')}]`);
}

/* E2 - nav Settings kiri tidak lagi memuat seksi AI Models: kontrol negatif yang
   menahan agar seksi itu tidak diam-diam dikembalikan ke nav. */
{
  const nav = await cdp.json(`
    await bukaSet();
    return JSON.stringify({
      ids: qa('[data-testid^="set-nav-"]').map((e) => e.getAttribute('data-testid')),
      models: !!q('[data-testid="set-nav-models"]'),
    });
  `, 30000);
  await cdp.runAsync(`${JADIKAN_DASAR} return 'ok';`, 25000);
  capture.E2 = nav;

  const berakhirModels = (nav.ids ?? []).filter((t) => /models$/i.test(t));
  cek('E2', (nav.ids ?? []).length > 0 && nav.models === false && berakhirModels.length === 0,
    `nav Settings kiri (set-nav-*) tidak lagi memuat seksi AI Models `
    + `(set-nav-models=${nav.models}, id berakhiran "models"=[${berakhirModels.join(',') || '-'}], jumlah nav=${(nav.ids ?? []).length})`);
}

/* E3 - seksi Models di Chat Settings kini HANYA berisi baris HydraFusion. Ini
   penjaga "tanpa kehilangan jejak": empat baris pindahan (cset-row-keys|
   askmodel|provider2|baseurl) harus benar-benar sudah tidak ada di sana, karena
   isinya sudah dibuktikan hidup di pop-up (B). */
{
  const cs = await cdp.json(`
    ${ALAT}
    ${JADIKAN_DASAR}
    klik('[data-testid="ai-more"]', 'tombol menu "…"');
    await wait(500);
    klik('[data-testid="ai-open-chat-settings"]', 'baris Chat Settings di menu "…"');
    ${EKOR_SCOPE}
    const navModels = q('[data-testid="cset-nav-models"]');
    if (navModels) { navModels.click(); await wait(340); }
    const navAktif = qa('[data-testid^="cset-nav-"]').find((e) => e.getAttribute('aria-current') === 'true');
    return JSON.stringify({
      cset: !!q('[data-testid="cset-page"]'),
      navAktif: navAktif ? navAktif.getAttribute('data-testid') : null,
      baris: qa('[data-testid^="cset-row-"]').map((e) => e.getAttribute('data-testid')),
    });
  `, 45000);
  capture.E3 = cs;

  const BARIS_HYDRA = ['cset-row-hydra', 'cset-row-hydrantingkat', 'cset-row-hydrabiaya', 'cset-row-hydraterakhir'];
  const BARIS_PINDAH = ['cset-row-keys', 'cset-row-askmodel', 'cset-row-provider2', 'cset-row-baseurl'];
  const ketemuHydra = BARIS_HYDRA.filter((b) => (cs.baris ?? []).includes(b));
  const masihPindah = BARIS_PINDAH.filter((b) => (cs.baris ?? []).includes(b));
  const ok = !!cs.cset && cs.navAktif === 'cset-nav-models'
    && ketemuHydra.length === BARIS_HYDRA.length && masihPindah.length === 0;
  cek('E3', ok,
    `seksi Models di Chat Settings kini hanya berisi baris HydraFusion `
    + `(nav aktif=${cs.navAktif}, baris HydraFusion=[${ketemuHydra.join(',')}] dari [${BARIS_HYDRA.join(',')}], `
    + `baris pindahan yang masih tersisa di Chat Settings=[${masihPindah.join(',') || '-'}])`);
}

/* ---------- D: tab panel bawah & kolom kanan ---------- */

const NO_AI = /(^|[^a-z])(ai|chat|assistant|copilot)([^a-z]|$)/i;
const TABS_SAH = ['problems', 'output', 'debug', 'terminal', 'ports', 'subagents'];

let tabs = null;
try {
  tabs = await cdp.json(`
    ${JADIKAN_DASAR}
    const stT = T.getState();
    const semulaTampak = !!stT.visible;
    stT.setVisible(true);
    await wait(500);
    const render = qa('[data-testid="pts-tab"]').map((e) => ({ id: e.getAttribute('data-tab'), label: e.textContent.trim() }));
    const tombol = q('[data-testid="pts-menu"]');
    if (tombol) { tombol.click(); await wait(500); }
    const daftar = qa('[data-testid="pts-menu-item"]').map((e) => ({ id: e.getAttribute('data-tab'), label: e.textContent.trim() }));
    const menuTerbuka = !!q('[data-testid="pts-menu-list"]');
    if (tombol && menuTerbuka) { tombol.click(); await wait(300); }
    stT.setVisible(semulaTampak);
    return JSON.stringify({
      render, daftar, menuTerbuka, semulaTampak,
      semua: window.__ZEPHYR_PANEL__.PANEL_TABS.map((t) => t.id),
      aktif: window.__ZEPHYR_PANEL__.activeTab(),
      stripAda: !!q('[data-testid="panel-tabstrip"]'),
    });
  `, 30000);
} catch (e) {
  cek('D1', false, `daftar tab panel bawah tidak terbaca — ${e.message}`);
}

if (tabs) {
  const renderIds = tabs.render.map((t) => t.id);
  const menuIds = tabs.daftar.length ? tabs.daftar.map((t) => t.id) : tabs.semua;
  const kotor = [...new Set([...renderIds, ...menuIds].filter((id) => NO_AI.test(String(id))))];

  cek('D1', renderIds.length > 0 && renderIds.includes('subagents') && kotor.length === 0,
    `tab panel bawah tidak memuat tab AI (terrender=[${renderIds.join(',')}]`
    + `${tabs.menuTerbuka ? `, menu=[${menuIds.join(',')}]` : ', menu "…" tidak terbaca'}`
    + `, semua tab=[${tabs.semua.join(',')}], aktif=${tabs.aktif}, entri berbau AI=[${kotor.join(',') || '-'}])`);

  const luar = [...new Set([...renderIds, ...menuIds].filter((id) => !TABS_SAH.includes(id)))];
  cek('D1b', luar.length === 0 && menuIds.length === tabs.semua.length,
    `isi strip & menu tab sama dengan daftar tab yang sah (${TABS_SAH.join('/')}); di luar daftar=[${luar.join(',') || '-'}]`
    + `, jumlah di menu=${menuIds.length} dari ${tabs.semua.length}`);
}

{
  const k = await baca();
  capture.D2 = k;
  const diKanan = k.aiRect && k.layar ? k.aiRect.x >= k.layar / 2 : false;
  cek('D2', !!k.aiPanel && !!k.aiTampak && !k.aiDalamPanel && !!k.aiChat && !!k.aiHost && diKanan,
    `panel AI tetap di kolom kanan, bukan di dalam panel bawah (ai-panel=${k.aiPanel}, tampak=${k.aiTampak}, `
    + `ai-chat=${k.aiChat}, ai-host=${k.aiHost}, di dalam panel-body=${k.aiDalamPanel}, `
    + `rect.x=${k.aiRect?.x ?? '-'} dari lebar ${k.layar})`);
}

/* ---------- Z0: keadaan app dikembalikan ---------- */

{
  await cdp.runAsync(`${JADIKAN_DASAR} return 'ok';`, 25000);
  const k = await baca();
  capture.Z0 = k;
  cek('Z0', k.activity === DASAR.activity && !k.settingsOpen && !k.setPage && !k.cset && !k.aim && k.aiPanel && k.aiTampak,
    `keadaan app dikembalikan seperti semula (activity=${k.activity} [dasar ${DASAR.activity}], `
    + `settingsOpen=${k.settingsOpen}, settings-page=${k.setPage}, cset=${k.cset}, aim-pop=${k.aim}, `
    + `panel visible=${k.termVisible}, provider=${k.provider}, ai-panel=${k.aiPanel}/${k.aiTampak})`);
}

/* ---------- laporan ---------- */

await cdp.close();

const laporan = {
  ketika: new Date().toISOString(),
  port: PORT,
  app: { activityAwal: awal.activity, url: 'http://localhost:5173/' },
  dasar: DASAR,
  lulus: total - gagal,
  total,
  catatan,
  capture,
  tabs,
};

try {
  const berkas = `${SCRATCH}/uji-set-pindah-${STAMP}.json`;
  writeFileSync(berkas, JSON.stringify(laporan, null, 2), 'utf8');
  console.log(`\n  bukti mentah: ${berkas}`);
} catch (e) {
  console.log(`\n  (gagal menulis berkas bukti: ${e.message})`);
}

console.log(`\n== ${total - gagal}/${total} PASS ==`);
if (gagal) console.log(`   ${gagal} pemeriksaan GAGAL — lihat baris FAIL di atas dan bukti mentahnya.`);
keluarBersih(gagal ? 1 : 0);
