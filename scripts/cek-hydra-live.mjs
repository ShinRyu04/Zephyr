/**
 * cek-hydra-live.mjs - periksa di app yang BENAR-BENAR jalan:
 *
 *   1. Baris status di atas composer. Yang benar: ada saat sibuk, TIDAK ada
 *      saat menganggur.
 *   2. Baris tahap HydraFusion ("Stage 2 of 3 - kritik - model"). Ini yang
 *      menjawab masalah streaming berlapis: dua dari tiga request dibuffer dan
 *      tidak pernah muncul di transkrip, jadi tanpa baris ini panel tampak
 *      menganggur selama dua jawaban penuh. Diperiksa sintetis (state di-set
 *      langsung) supaya tidak bergantung pada provider.
 *   3. Halaman Chat Settings: baris HydraFusion benar-benar dirender (label,
 *      hint, tiga tier, plafon request, laporan rute terakhir), dan toggle-nya
 *      benar-benar menulis ke settings (bolak-balik).
 *   4. Satu run NYATA (opsional): satu request murah di sesi sementara yang
 *      dihapus lagi, untuk membuktikan hook di `send()` menyala dan laporan
 *      rute terakhir terisi.
 *
 *   Perbaikan d1 (2026-10-13) - harness ini sudah usang di tiga tempat:
 *
 *   a. "sibuk" dulu dibaca dari `state.pending`. Store kini menyimpan
 *      `pendings[composerId]` (satu composer per pane), jadi setState kunci
 *      lama itu TIDAK pernah menyalakan barisnya - section 1 lulus kosong dan
 *      section 2 selalu merah. Sekarang: agentBusy ATAU salah satu pendings.
 *   b. Chat Settings dibuka lewat `bukaViewAi('chat-settings')`. Jalur itu kini
 *      membuka TAB di area editor (view lain). Halaman Chat Settings yang
 *      dimaksud harness dibuka dari menu nyata: tombol `ai-more` ->
 *      item `ai-open-chat-settings`. Karena opener lama tidak pernah membuka
 *      halamannya, SEMUA testid `cset-*` kembali null dan skrip mati di
 *      `knop.click()` ("Cannot read properties of null").
 *   c. Isi halaman berubah: plafon request kini `<select>` (`cset-hydracap`,
 *      opsi 1..N), bukan range + kotak angka; baris rute terakhir selalu ada
 *      (`cset-hydralast` berisi placeholder selama belum ada run). Assertion
 *      lama "input.set-num-box / input.set-range" tidak punya elemen lagi.
 *
 *   node scripts/cek-hydra-live.mjs [port] [--tanpa-run]
 *
 * Port default 9223 (debug WebView2). Keluar non-nol kalau ada yang gagal,
 * jadi bisa dipakai sebagai gerbang, bukan cuma cetakan.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const LEWATI_RUN = process.argv.includes('--tanpa-run');
const { cdp } = await Cdp.attach(PORT);

let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (!ok) gagal += 1;
  console.log((ok ? '  ok   ' : 'GAGAL  ') + nama + (info ? '  ' + info : ''));
};
const catat = (nama, info) => console.log('  info   ' + nama + (info ? '  ' + info : ''));
/* Halaman bisa mengembalikan string panjang; pendekkan supaya laporan terbaca. */
const potong = (t, n = 110) => (t == null ? null : String(t).replace(/\s+/g, ' ').trim().slice(0, n));

/* ------------------------------------------------- 0. bersihkan sisa uji */
/* Halaman setelan bisa tertinggal terbuka dari uji sebelumnya; tutup dulu
 * supaya semua yang diukur di bawah ini diukur pada keadaan awal yang sama. */
await cdp.json(`
  const tutup = q('[data-testid="cset-close"]');
  if (tutup) { tutup.click(); await wait(300); }
  return JSON.stringify({ masihAda: !!q('[data-testid="cset-page"]') });
`);

/* ---------------------------------------------------------------- 1. panel */
const panel = await cdp.json(`
  const A = X.store.getState();
  /* agentBusy kini per-composer: bidang pipih 'agentBusy' cuma cermin lama,
     sedangkan panel membaca peta agentBusys[composerId]. Peta itulah yang
     harus diperiksa kalau tidak mau lulus kosong. */
  const sibukSekarang = Object.values(A.agentBusys ?? {}).some(Boolean)
    || Object.values(A.pendings ?? {}).some(Boolean);
  const rowL = q('[data-testid="ai-work-stack-loop"]');
  const rowH = q('[data-testid="ai-work-hydra"]');
  return JSON.stringify({
    panelAda: !!q('.ai-chat'),
    sibuk: sibukSekarang,
    jumlahPending: Object.values(A.pendings ?? {}).filter(Boolean).length,
    barisLoopAda: !!rowL,
    teksBarisLoop: rowL ? rowL.innerText : null,
    barisTahapAda: !!rowH,
  });
`);
cek('panel chat ter-mount', panel.panelAda);
cek('menganggur: baris status TIDAK ada', !panel.barisLoopAda, JSON.stringify({ sibuk: panel.sibuk, teks: potong(panel.teksBarisLoop) }));
cek('menganggur: baris tahap HydraFusion TIDAK ada', !panel.barisTahapAda);

/* ------------------------------------------- 2. baris tahap (sintetis) */
/* `agentBusy` dipakai sebagai pemicu, bukan `pending`: pemicunya harus bebas
 * dari kunci per-composer supaya uji ini tidak ikut rapuh saat bentuk store
 * berubah lagi. */
const tahap = await cdp.json(`
  const asli = X.store.getState();
  const lama = { agentBusys: asli.agentBusys, hydraTahap: asli.hydraTahap };
  const semuaSibuk = Object.fromEntries(
    Object.keys(asli.agentBusys ?? { '': false }).map((k) => [k, true]));
  X.store.setState({ agentBusys: semuaSibuk, hydraTahap: {
    request: 2, total: 3, jalur: 'kritik-revisi', peran: 'kritik',
    provider: 'uji', model: 'model-uji', catatan: 'catatan uji', berhenti: 'selesai',
  } });
  await wait(250);
  const el = q('[data-testid="ai-work-hydra"]');
  const bagian = (id) => { const e2 = q('[data-testid="' + id + '"]'); return e2 ? e2.innerText : null; };
  const hasil = {
    ada: !!el,
    angka: bagian('ai-work-hydra-tahap'),
    peranModel: bagian('ai-work-hydra-peran'),
    warna: el ? getComputedStyle(el).color : null,
    tinggi: el ? Math.round(el.getBoundingClientRect().height) : null,
  };
  X.store.setState({ agentBusys: lama.agentBusys, hydraTahap: lama.hydraTahap });
  await wait(300);
  hasil.sesudahDibersihkan = !!q('[data-testid="ai-work-hydra"]');
  return JSON.stringify(hasil);
`);
cek('baris tahap dirender saat sibuk', tahap.ada);
cek('denominator jujur (Stage 2 of 3)', /2/.test(tahap.angka ?? '') && /3/.test(tahap.angka ?? ''), potong(tahap.angka, 40));
cek('peran + model disebut', /kritik/.test(tahap.peranModel ?? '') && /model-uji/.test(tahap.peranModel ?? ''), potong(tahap.peranModel, 60));
cek('warnanya dari kelas CSS (bukan default)', !!tahap.warna && tahap.warna !== 'rgb(0, 0, 0)', String(tahap.warna));
cek('satu baris saja (tidak mendorong composer)', (tahap.tinggi ?? 99) <= 22, String(tahap.tinggi) + 'px');
cek('baris tahap HILANG setelah state dibersihkan', tahap.sesudahDibersihkan === false);

/* --------------------------------- 3. halaman Chat Settings (jalur menu) */
const buka = await cdp.json(`
  const menu = q('[data-testid="ai-more"]');
  if (!menu) return JSON.stringify({ error: 'tombol ai-more tidak ada' });
  if (!q('[data-testid="ai-open-chat-settings"]')) {
    menu.click();
    await wait(250);
  }
  const item = q('[data-testid="ai-open-chat-settings"]');
  if (!item) return JSON.stringify({ error: 'item ai-open-chat-settings tidak ada di menu' });
  item.click();
  for (let i = 0; i < 30; i++) {
    if (q('[data-testid="cset-page"]')) break;
    await wait(200);
  }
  /* Rodanya bisa membuka halaman di seksi lain; pastikan seksi model tampil. */
  if (!q('[data-testid="cset-row-hydra"]')) {
    const nav = q('[data-testid="cset-nav-models"]');
    if (nav) { nav.click(); await wait(500); }
  }
  return JSON.stringify({ pageAda: !!q('[data-testid="cset-page"]'), rowAda: !!q('[data-testid="cset-row-hydra"]') });
`);
cek('Chat Settings terbuka dari menu ⋯', buka.pageAda === true, JSON.stringify(buka));

const set = await cdp.json(`
  const row = (id) => q('[data-testid="' + id + '"]');
  const ambilLabel = (el) => { const e2 = el ? el.querySelector('.set-label') : null; return e2 ? e2.innerText : null; };
  const ambilHint = (el) => { const e2 = el ? el.querySelector('.set-hint') : null; return e2 ? e2.innerText : null; };
  const pilihan = (el) => {
    const sel = !el ? null : (el.tagName === 'SELECT' ? el : el.querySelector('select'));
    if (!sel) return null;
    return { jumlah: sel.options.length, nilai: sel.value,
             pertama: sel.options[0] ? { nilai: sel.options[0].value, teks: sel.options[0].text } : null,
             terakhir: sel.options[sel.options.length - 1] ? sel.options[sel.options.length - 1].value : null };
  };
  const tier = ['cheap', 'mid', 'strong'].map((t) => {
    const el = row('cset-hydra-' + t);
    return { tier: t, ada: !!el, pilihan: pilihan(el) };
  });
  const baris = row('cset-row-hydra');
  const knop = row('cset-hydra');
  const barisTier = row('cset-row-hydrantingkat');
  const barisCap = row('cset-row-hydrabiaya');
  const cap = row('cset-hydracap');
  return JSON.stringify({
    halamanAda: !!row('cset-row-hydra'),
    knop: knop ? { tag: knop.tagName, role: knop.getAttribute('role'), checked: knop.getAttribute('aria-checked') } : null,
    labelToggle: ambilLabel(baris),
    hintToggle: ambilHint(baris),
    labelTier: ambilLabel(barisTier),
    tier: tier,
    labelCap: ambilLabel(barisCap),
    cap: pilihan(cap),
    lastAda: !!row('cset-hydralast'),
    lastTeks: row('cset-hydralast') ? row('cset-hydralast').innerText : null,
    hidraDiStore: JSON.stringify(S.getState().settings.hydrafusion ?? null),
  });
`);
cek('halaman punya baris HydraFusion', set.halamanAda);
cek('toggle = role switch', set.knop?.role === 'switch', JSON.stringify(set.knop));
cek('label + hint terisi (bukan string kosong)', !!set.labelToggle && !!set.hintToggle, potong(set.labelToggle, 40) + ' / ' + potong(set.hintToggle, 50));
cek('tiga tier punya pilihan', set.tier.every((t) => t.ada && t.pilihan), JSON.stringify(set.tier.map((t) => t.tier + (t.ada ? ':' + (t.pilihan ? t.pilihan.jumlah : 0) + 'opsi' : ':tidak-ada'))));
cek('opsi pertama tiap tier = Auto (nilai kosong)', set.tier.every((t) => t.pilihan && t.pilihan.pertama && t.pilihan.pertama.nilai === ''),
  JSON.stringify(set.tier.map((t) => (t.pilihan && t.pilihan.pertama ? t.pilihan.pertama.teks : '?'))));
cek('plafon request = pilihan 1..N', !!set.cap && set.cap.jumlah >= 2 && /^\d+$/.test(String(set.cap.nilai)), JSON.stringify(set.cap));
cek('baris laporan rute terakhir ada', set.lastAda, potong(set.lastTeks, 90));
catat('hydrafusion di settings', set.hidraDiStore);

/* bolak-balik toggle: membuktikan kontrolnya benar-benar menulis, bukan hiasan */
const bolak = await cdp.json(`
  /* Elemennya diambil ULANG tiap kali: React mengganti node tombol ini saat
     prop 'checked' berubah, jadi node lama yang disimpan dari sebelum klik
     sudah lepas dari dokumen dan klik berikutnya tidak mengurus apa pun. */
  const ambil = () => q('[data-testid="cset-hydra"]');
  const enabled = () => S.getState().settings.hydrafusion?.enabled === true;
  const knopAwal = ambil();
  if (!knopAwal) return JSON.stringify({ error: 'toggle cset-hydra tidak ada' });
  const awal = enabled();
  knopAwal.click();
  await wait(500);
  const sesudahKlik = enabled();
  const ariaKlik = (ambil() ?? knopAwal).getAttribute('aria-checked');
  (ambil() ?? knopAwal).click();
  await wait(500);
  const sesudahBalik = enabled();
  return JSON.stringify({ awal: awal, sesudahKlik: sesudahKlik, ariaKlik: ariaKlik, sesudahBalik: sesudahBalik });
`);
cek('klik toggle mengubah settings', bolak.sesudahKlik !== bolak.awal, JSON.stringify(bolak));
cek('klik kedua mengembalikan settings', bolak.sesudahBalik === bolak.awal);
cek('aria-checked mengikuti state', bolak.ariaKlik === String(bolak.sesudahKlik), String(bolak.ariaKlik));

/* --------------------------------------------- 4. run NYATA (satu request) */
if (LEWATI_RUN) {
  catat('run nyata', 'dilewati (--tanpa-run)');
} else {
  const run = await cdp.json(
    `
    /* Penonton, bukan pengintai: MutationObserver mencatat baris tahap setiap
       kali muncul, jadi run cepat pun tidak lolos hanya karena polling kalah
       cepat. */
    const catatan = [];
    const lihat = () => {
      const el = q('[data-testid="ai-work-hydra"]');
      if (el) {
        const t = el.innerText;
        if (catatan[catatan.length - 1] !== t) catatan.push(t);
      }
    };
    const obs = new MutationObserver(lihat);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });

    const sibuk = () => { const st = X.store.getState();
      return Object.values(st.agentBusys ?? {}).some(Boolean)
        || Object.values(st.pendings ?? {}).some(Boolean); };

    const idLama = (() => { const st = X.store.getState();
      const f = st.activeSession || st.activeChat; return typeof f === 'function' ? (f.call(st)?.id ?? null) : (st.activeChatId ?? null); })();
    const set0 = S.getState().settings.hydrafusion ?? {};
    const tier0 = set0.tiers ?? { cheap: '', mid: '', strong: '' };
    /* Mode bawaan app adalah 'agent' (localStorage zephyr.ai.mode), dan jalur
       HydraFusion hanya ada di jalur CHAT - send() memilih sendAgent() lebih
       dulu. Tanpa memindah mode, uji ini mengirim lewat agen dan baris tahap
       tidak akan pernah muncul, betapapun setelannya menyala. */
    const modeLama = X.store.getState().agentMode;
    X.store.getState().setAgentMode('chat');
    /* Satu request: cukup untuk membuktikan hook menyala, dan cukup murah
       untuk dijalankan sesuka hati.
       Tier-nya dipaksa AUTO (nilai kosong = ikut model pembaca) selama uji:
       tier tersimpan bisa menunjuk model yang tidak bisa menjawab, dan run-nya
       lalu terbaca sebagai kegagalan HydraFusion padahal itu salah setelan -
       bukan yang sedang diuji di sini. Nilai aslinya dipulihkan di akhir. */
    const tierAuto = { cheap: '', mid: '', strong: '' };
    await S.getState().applySettings({ hydrafusion: { enabled: true, maxRequests: 1, tiers: tierAuto } });
    const idUji = X.store.getState().newChat();
    const mulai = Date.now();
    await X.store.getState().send('Jawab satu kata: siap.');
    let selesai = false;
    while (Date.now() - mulai < 120000) {
      if (!sibuk()) { selesai = true; break; }
      await wait(250);
    }
    await wait(400);
    obs.disconnect();
    const st2 = X.store.getState();
    const daftar = st2.sessions ?? [];
    const sesi = daftar.find((x) => x.id === idUji) ?? null;
    const pesanAkhir = sesi && sesi.messages.length ? sesi.messages[sesi.messages.length - 1] : null;
    const keluar = {
      selesai: selesai,
      ms: Date.now() - mulai,
      mode: X.store.getState().agentMode,
      tahapTerlihat: catatan,
      hydraTerakhir: st2.hydraTerakhir ? JSON.stringify(st2.hydraTerakhir) : null,
      hydraTahapSisa: st2.hydraTahap ? JSON.stringify(st2.hydraTahap) : null,
      balasan: pesanAkhir ? String(pesanAkhir.content ?? '').slice(0, 200) : null,
      barisTahapSisa: !!q('[data-testid="ai-work-hydra"]'),
    };
    /* Bersih-bersih: sesi uji dihapus, sesi lama dipilih lagi, setting
       dipulihkan, halaman setelan ditutup. Sisa sampah di chat pembaca bukan
       bukti, cuma gangguan. */
    if (idUji && X.store.getState().deleteChat) X.store.getState().deleteChat(idUji);
    if (idLama && X.store.getState().selectChat) X.store.getState().selectChat(idLama);
    X.store.getState().setAgentMode(modeLama);
    await S.getState().applySettings({ hydrafusion: { enabled: set0.enabled === true,
      maxRequests: set0.maxRequests ?? 3, tiers: tier0 } });
    const tutup = q('[data-testid="cset-close"]');
    if (tutup) { tutup.click(); await wait(300); }
    return JSON.stringify(keluar);
  `,
    180000,
  );

  cek('run selesai tanpa menggantung', run.selesai, String(run.ms) + ' ms');
  catat('mode saat kirim', run.mode ?? '(tidak dicatat)');
  cek('baris tahap muncul di run nyata', (run.tahapTerlihat ?? []).length > 0, JSON.stringify((run.tahapTerlihat ?? []).map((t) => potong(t, 50))));
  const akhir = run.hydraTerakhir ? JSON.parse(run.hydraTerakhir) : null;
  cek('laporan rute terakhir terisi', !!akhir && !!akhir.model && !!akhir.alasan, potong(run.hydraTerakhir, 160));
  cek('tahap dibersihkan setelah run', run.hydraTahapSisa === null && run.barisTahapSisa === false, potong(run.hydraTahapSisa, 60));
  cek('plafon request dihormati', akhir ? akhir.request <= 1 : false, akhir ? String(akhir.request) + ' request, berhenti=' + akhir.berhenti : '(tidak ada laporan)');
  /*
   * Jujur soal hasil: 'gagal' hanya boleh muncul kalau memang TIDAK ada
   * jawaban. Pass yang teksnya sudah sampai ke pembaca tapi dilaporkan gagal
   * adalah bug pelaporan (buffernya dibaca sebelum framenya mendarat), dan
   * pemeriksaan inilah yang menahannya.
   */
  const adaJawab = String(run.balasan ?? '').trim().length > 0;
  cek('laporan rute jujur: gagal hanya kalau tak ada jawaban', !(adaJawab && akhir && akhir.berhenti === 'gagal'),
    'balasan=' + (adaJawab ? 'ada' : 'kosong') + ', berhenti=' + (akhir ? akhir.berhenti : '?') +
    ', catatanTahap=' + JSON.stringify(akhir ? akhir.catatanTahap : null));
  catat('balasan', potong(run.balasan, 120));
}

/* Halaman setelan ditutup lagi kalau uji rute dilewati, supaya app ditinggal
 * dalam keadaan rapi untuk harness berikutnya. */
await cdp.json(`const t = q('[data-testid="cset-close"]'); if (t) { t.click(); await wait(250); } return JSON.stringify({ bersih: !q('[data-testid="cset-page"]') });`);

console.log('');
console.log(gagal === 0 ? '== semua cek lulus ==' : '== ' + gagal + ' cek GAGAL ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
