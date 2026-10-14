/**
 * cek-hydra-live.mjs - periksa di app yang BENAR-BENAR jalan:
 *
 *   1. Baris loop di atas composer. Sebelum perubahan ia tetap terlihat
 *      sesudah run selesai ("Loop finished"), mendorong composer turun.
 *      Yang benar: ada saat sibuk, TIDAK ada saat menganggur.
 *   2. Baris tahap HydraFusion ("Stage 2 of 3 - kritik - model"). Ini yang
 *      menjawab masalah streaming berlapis: dua dari tiga request dibuffer
 *      dan tidak pernah muncul di transkrip, jadi tanpa baris ini panel
 *      tampak menganggur selama dua jawaban penuh. Diperiksa sintetis
 *      (state di-set langsung) supaya tidak bergantung pada provider.
 *   3. Halaman pengaturan: empat baris HydraFusion benar-benar dirender,
 *      toggle-nya benar-benar menulis ke settings (bolak-balik), dan
 *      pilihan tier diisi HANYA provider yang siap.
 *   4. Satu run NYATA (opsional): satu request murah di sesi sementara yang
 *      dihapus lagi, untuk membuktikan hook di `send()` menyala dan laporan
 *      rute terakhir terisi.
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

/* ---------------------------------------------------------------- 1. panel */
const panel = await cdp.json(`
  const A = X.store.getState();
  const rowL = q('[data-testid="ai-work-stack-loop"]');
  const rowH = q('[data-testid="ai-work-hydra"]');
  return JSON.stringify({
    panelAda: !!q('.ai-chat'),
    sibuk: !!(A.pending || A.agentBusy),
    barisLoopAda: !!rowL,
    teksBarisLoop: rowL ? rowL.innerText : null,
    barisTahapAda: !!rowH,
  });
`);
cek('panel chat ter-mount', panel.panelAda);
cek('menganggur: baris loop TIDAK ada', !panel.barisLoopAda, JSON.stringify({ sibuk: panel.sibuk, teks: potong(panel.teksBarisLoop) }));
cek('menganggur: baris tahap HydraFusion TIDAK ada', !panel.barisTahapAda);

/* ------------------------------------------- 2. baris tahap (sintetis) */
const tahap = await cdp.json(`
  const asli = X.store.getState();
  const lama = { pending: asli.pending, hydraTahap: asli.hydraTahap };
  X.store.setState({ pending: 'uji-hydra', hydraTahap: {
    request: 2, total: 3, jalur: 'kritik-revisi', peran: 'kritik',
    provider: 'uji', model: 'model-uji', catatan: 'catatan uji',
  } });
  await wait(220);
  const el = q('[data-testid="ai-work-hydra"]');
  const bagian = (id) => { const e2 = q('[data-testid="' + id + '"]'); return e2 ? e2.innerText : null; };
  const hasil = {
    ada: !!el,
    angka: bagian('ai-work-hydra-tahap'),
    peranModel: bagian('ai-work-hydra-peran'),
    warna: el ? getComputedStyle(el).color : null,
    tinggi: el ? Math.round(el.getBoundingClientRect().height) : null,
  };
  X.store.setState({ pending: lama.pending, hydraTahap: lama.hydraTahap });
  await wait(260);
  hasil.sesudahDibersihkan = !!q('[data-testid="ai-work-hydra"]');
  return JSON.stringify(hasil);
`);
cek('baris tahap dirender saat sibuk', tahap.ada);
cek('denominator jujur (Stage 2 of 3)', /2/.test(tahap.angka ?? '') && /3/.test(tahap.angka ?? ''), potong(tahap.angka, 40));
cek('peran + model disebut', /kritik/.test(tahap.peranModel ?? '') && /model-uji/.test(tahap.peranModel ?? ''), potong(tahap.peranModel, 60));
cek('warnanya dari kelas CSS (bukan default)', !!tahap.warna && tahap.warna !== 'rgb(0, 0, 0)', String(tahap.warna));
cek('satu baris saja (tidak mendorong composer)', (tahap.tinggi ?? 99) <= 22, String(tahap.tinggi) + 'px');
cek('baris tahap HILANG setelah state dibersihkan', tahap.sesudahDibersihkan === false);

/* --------------------------------- 3. halaman pengaturan HydraFusion */
const set = await cdp.json(`
  S.getState().bukaViewAi('chat-settings');
  await wait(1500);
  const row = (id) => q('[data-testid="' + id + '"]');
  const ambilLabel = (el) => { const e2 = el ? el.querySelector('.set-label') : null; return e2 ? e2.innerText : null; };
  const ambilHint = (el) => { const e2 = el ? el.querySelector('.set-hint') : null; return e2 ? e2.innerText : null; };
  const pilihan = (el) => {
    const sel = el ? el.querySelector('select') : null;
    if (!sel) return null;
    return { jumlah: sel.options.length, nilai: sel.value,
             pertama: sel.options[0] ? { nilai: sel.options[0].value, teks: sel.options[0].text } : null };
  };
  const tier = ['cheap', 'mid', 'strong'].map((t) => {
    const el = row('cset-hydra-' + t);
    return { tier: t, ada: !!el, pilihan: pilihan(el), aria: el ? el.getAttribute('aria-label') : null };
  });
  const cap = row('cset-hydracap');
  const knop = row('cset-hydra');
  const kotakCap = cap ? cap.querySelector('input.set-num-box') : null;
  const geserCap = cap ? cap.querySelector('input.set-range') : null;
  return JSON.stringify({
    halamanAda: !!knop,
    knop: knop ? { role: knop.getAttribute('role'), checked: knop.getAttribute('aria-checked') } : null,
    labelToggle: ambilLabel(row('hydra')),
    hintToggle: ambilHint(row('hydra')),
    tier: tier,
    cap: { ada: !!cap, angka: kotakCap ? kotakCap.value : null, min: geserCap ? geserCap.min : null, maks: geserCap ? geserCap.max : null },
    labelCap: ambilLabel(row('hydrabiaya')),
    lastAda: !!row('cset-hydralast'),
    lastTeks: row('cset-hydralast') ? row('cset-hydralast').innerText : null,
    hidraDiStore: JSON.stringify(S.getState().settings.hydrafusion ?? null),
  });
`);
cek('halaman pengaturan punya baris HydraFusion', set.halamanAda);
cek('toggle = role switch', set.knop?.role === 'switch', JSON.stringify(set.knop));
cek('label + hint terisi (bukan string kosong)', !!set.labelToggle && !!set.hintToggle, potong(set.labelToggle, 40) + ' / ' + potong(set.hintToggle, 50));
cek('tiga tier punya <select>', set.tier.every((t) => t.ada && t.pilihan), JSON.stringify(set.tier.map((t) => t.tier + (t.ada ? ':' + (t.pilihan ? t.pilihan.jumlah : 0) + 'opsi' : ':tidak-ada'))));
cek('opsi pertama tiap tier = Auto (nilai kosong)', set.tier.every((t) => t.pilihan && t.pilihan.pertama && t.pilihan.pertama.nilai === ''),
  JSON.stringify(set.tier.map((t) => (t.pilihan && t.pilihan.pertama ? t.pilihan.pertama.teks : '?'))));
cek('plafon request: range + angka', set.cap.ada && set.cap.angka != null && set.cap.min != null, JSON.stringify(set.cap));
cek('baris laporan rute terakhir ada', set.lastAda, potong(set.lastTeks, 90));
catat('hydrafusion di settings', set.hidraDiStore);

/* bolak-balik toggle: membuktikan kontrolnya benar-benar menulis, bukan hiasan */
const bolak = await cdp.json(`
  const knop = q('[data-testid="cset-hydra"]');
  const awal = S.getState().settings.hydrafusion?.enabled === true;
  knop.click();
  await wait(450);
  const sesudahKlik = S.getState().settings.hydrafusion?.enabled === true;
  const ariaKlik = knop.getAttribute('aria-checked');
  knop.click();
  await wait(450);
  const sesudahBalik = S.getState().settings.hydrafusion?.enabled === true;
  return JSON.stringify({ awal: awal, sesudahKlik: sesudahKlik, ariaKlik: ariaKlik, sesudahBalik: sesudahBalik });
`);
cek('klik toggle mengubah settings', bolak.sesudahKlik !== bolak.awal, JSON.stringify(bolak));
cek('klik kedua mengembalikan settings', bolak.sesudahBalik === bolak.awal);
cek('aria-checked mengikuti state', bolak.ariaKlik === String(bolak.sesudahKlik), String(bolak.ariaKlik));

/* --------------------------------------------- 4. run NYATA (satu request) */
if (LEWATI_RUN) {
  catat('run nyata', 'dilewati (--tanpa-run)');
} else {
  const run = await cdp.json(`
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

    const idLama = X.store.getState().activeSession()?.id ?? null;
    const set0 = S.getState().settings.hydrafusion ?? {};
    const tier0 = set0.tiers ?? { cheap: '', mid: '', strong: '' };
    /* Satu request: cukup untuk membuktikan hook menyala, dan cukup murah
       untuk dijalankan sesuka hati. */
    await S.getState().applySettings({ hydrafusion: { enabled: true, maxRequests: 1, tiers: tier0 } });
    const idUji = X.store.getState().newChat();
    const mulai = Date.now();
    await X.store.getState().send('Jawab satu kata: siap.');
    let selesai = false;
    while (Date.now() - mulai < 120000) {
      const st = X.store.getState();
      if (!st.pending && !st.agentBusy) { selesai = true; break; }
      await wait(250);
    }
    await wait(400);
    obs.disconnect();
    const sesi = X.store.getState().sessions.find((x) => x.id === idUji) ?? null;
    const pesanAkhir = sesi && sesi.messages.length ? sesi.messages[sesi.messages.length - 1] : null;
    const keluar = {
      selesai: selesai,
      ms: Date.now() - mulai,
      tahapTerlihat: catatan,
      hydraTerakhir: X.store.getState().hydraTerakhir ? JSON.stringify(X.store.getState().hydraTerakhir) : null,
      hydraTahapSisa: X.store.getState().hydraTahap ? JSON.stringify(X.store.getState().hydraTahap) : null,
      balasan: pesanAkhir ? String(pesanAkhir.content ?? '').slice(0, 200) : null,
      barisTahapSisa: !!q('[data-testid="ai-work-hydra"]'),
    };
    /* Bersih-bersih: sesi uji dihapus, sesi lama dipilih lagi, setting
       dipulihkan. Sisa sampah di chat pembaca bukan bukti, cuma gangguan. */
    X.store.getState().deleteChat(idUji);
    if (idLama) X.store.getState().selectChat(idLama);
    await S.getState().applySettings({ hydrafusion: { enabled: set0.enabled === true,
      maxRequests: set0.maxRequests ?? 3, tiers: tier0 } });
    return JSON.stringify(keluar);
  `, 180000);

  cek('run selesai tanpa menggantung', run.selesai, String(run.ms) + ' ms');
  cek('baris tahap muncul di run nyata', (run.tahapTerlihat ?? []).length > 0, JSON.stringify((run.tahapTerlihat ?? []).map((t) => potong(t, 50))));
  const akhir = run.hydraTerakhir ? JSON.parse(run.hydraTerakhir) : null;
  cek('laporan rute terakhir terisi', !!akhir && !!akhir.model && !!akhir.alasan, potong(run.hydraTerakhir, 160));
  cek('tahap dibersihkan setelah run', run.hydraTahapSisa === null && run.barisTahapSisa === false, potong(run.hydraTahapSisa, 60));
  cek('plafon request dihormati', akhir ? akhir.request <= 1 : false, akhir ? String(akhir.request) + ' request, berhenti=' + akhir.berhenti : '(tidak ada laporan)');
  catat('balasan', potong(run.balasan, 120));
}

console.log('');
console.log(gagal === 0 ? '== semua cek lulus ==' : '== ' + gagal + ' cek GAGAL ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
