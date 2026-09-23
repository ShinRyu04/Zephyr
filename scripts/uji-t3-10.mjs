// uji-t3-10.mjs — verifikasi Settings → Subagent + panel compact (T3.10).
//
// KELUHAN USER yang diuji di sini:
//   1. "sub agent nya kok kek gini ya" — kartu mengulang hasil yang sudah ada
//      di chat, jadi terasa menumpuk
//   2. "dibikin ada settingan nya jga dong" — batas paralel/langkah dulu
//      hardcode, tidak bisa diubah user
//   3. "ada UI bru lgi untuk sub agents dan setttingannya"
//   4. "jgn numpuk kek gtu klo bisa" — form input selalu terbuka & besar
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== T3.10: Settings Subagent + panel compact ===\n');

// ── V1: KOMPATIBILITAS MUNDUR ──
// settings.json dari versi sebelum T3.10 tidak punya key `subagent`. Yang
// harus dibuktikan BUKAN "key-nya ada" (memang belum ada), melainkan:
//   (a) app tidak crash — halaman Settings tetap bisa dibuka
//   (b) nilai efektif jatuh ke default yang aman
// Key-nya baru tertulis setelah user mengubah setting (diuji di V2).
const set0 = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SUBSET__;
  const s = S.baca();
  const e = S.efektif();
  // Buktikan halaman Settings tetap hidup (tidak blank) dengan settings lama.
  window.__ZEPHYR_SETTINGS__.buka('subagent');
  await new Promise((r) => setTimeout(r, 1200));
  const inputAda = !!document.querySelector('[data-testid="sub-maxparallel"]');
  window.__ZEPHYR_SETTINGS__.tutup();
  await new Promise((r) => setTimeout(r, 600));
  return { ada: !!s, s, efektif: e, halamanHidup: inputAda, settingsUser: s };
})())`, 90000);
cek('settings lama (tanpa key subagent) tidak bikin app crash', set0.halamanHidup === true,
  set0.ada ? 'key sudah ada' : 'key belum ada — fallback dipakai');
// Uji FALLBACK harus benar-benar menghapus key `subagent` dulu. Tanpa itu yang
// terukur adalah settings user (mis. maxParallel: 2), bukan nilai fallback —
// dan ujinya gagal padahal aplikasinya benar.
const fallback = await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  // RFC 7386: null = HAPUS key (aturan deep_merge di settings.rs).
  await Ti.invoke('set_settings', { patch: { subagent: null } });
  await new Promise((r) => setTimeout(r, 900));
  // JANGAN pakai bootstrap(): ia punya guard bootstrapStarted sehingga
  // panggilan kedua tidak memuat apa pun. Terapkan settings dari disk langsung
  // ke store supaya jalur fallback benar-benar terpakai.
  const dariDisk = await Ti.invoke('get_settings');
  window.__ZEPHYR__.setState({ settings: dariDisk });
  await new Promise((r) => setTimeout(r, 700));
  const BS = window.__ZEPHYR_SUBSET__;
  return {
    maxParallel: BS.batasParalel(),
    maxSteps: BS.batasLangkah(),
    allowWrite: BS.efektif().allowWrite,
    adaKey: !!window.__ZEPHYR__.getState().settings.subagent,
  };
})())`,
  90000,
);
cek('fallback: 4 paralel', fallback.maxParallel === 4, String(fallback.maxParallel));
cek('fallback: 15 langkah', fallback.maxSteps === 15, String(fallback.maxSteps));
cek('fallback: TIDAK boleh menulis file', fallback.allowWrite === false);
// Kembalikan settings user supaya uji berikutnya tidak terpengaruh.
await cdp.json(
  `return JSON.stringify(await (async () => {
  await window.__ZEPHYR__.getState().applySettings({ subagent: ${JSON.stringify(set0.settingsUser)} });
  await new Promise((r) => setTimeout(r, 700));
  return 1;
})())`,
  90000,
);

// ── V2: mengubah setting benar-benar mengubah perilaku store ──
const ubah = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SUBSET__;
  await S.set({ maxParallel: 2, maxSteps: 6, allowWrite: true });
  await new Promise((r) => setTimeout(r, 900));
  const s = S.baca();
  const e = S.efektif();
  return { s, e };
})())`, 90000);
cek('maxParallel tersimpan', ubah.s?.maxParallel === 2, String(ubah.s?.maxParallel));
cek('maxSteps tersimpan', ubah.s?.maxSteps === 6, String(ubah.s?.maxSteps));
cek('allowWrite tersimpan', ubah.s?.allowWrite === true);
cek('nilai EFEKTIF ikut berubah', ubah.e.maxParallel === 2 && ubah.e.maxSteps === 6 && ubah.e.allowWrite === true,
  `paralel ${ubah.e.maxParallel}, langkah ${ubah.e.maxSteps}`);

// ── V3: batas paralel baru benar-benar dipakai saat menjalankan ──
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
// Pastikan baseUrl mock benar-benar terpasang — kalau tidak, request pergi
// ke API asli dan uji menggantung sampai timeout.
{
  const bu = window.__ZEPHYR__.getState().settings.models.providers.gemini?.baseUrl ?? '';
  if (!bu.includes('8098')) throw new Error('baseUrl mock tidak terpasang: ' + bu);
}

  const SUB = window.__ZEPHYR_SUB__;
  SUB.bersihkan();
  await new Promise((r) => setTimeout(r, 400));
  // Minta 6 tugas; batas sekarang 2 -> hanya 2 yang dibuat.
  await SUB.store.getState().jalankan(['a', 'b', 'c', 'd', 'e', 'f']);
  await new Promise((r) => setTimeout(r, 2500));
  const st = SUB.store.getState();
  return { n: st.agents.length, nama: st.agents.map((x) => x.nama) };
})())`, 180000);
cek('batas paralel 2 dihormati (6 diminta -> 2 dibuat)', jalan.n === 2, `${jalan.n} dibuat`);

// ── V4: section Settings → Subagent ada di UI ──
const ui = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SETTINGS__;
  S.buka('subagent');
  await new Promise((r) => setTimeout(r, 1200));
  const ada = (id) => !!document.querySelector('[data-testid="' + id + '"]');
  return {
    halaman: !!document.querySelector('.settings-page, [data-testid="settings-page"]'),
    navSubagent: !!document.querySelector('[data-testid="set-nav-subagent"]'),
    maxParallel: ada('sub-maxparallel'),
    maxSteps: ada('sub-maxsteps'),
    allowWrite: ada('sub-allowwrite'),
    showPanel: ada('sub-showpanel'),
    autoCollapse: ada('sub-autocollapse'),
    status: ada('sub-status'),
  };
})())`, 90000);
cek('section Subagent bisa dibuka', ui.halaman === true);
cek('input maxParallel ada', ui.maxParallel === true);
cek('input maxSteps ada', ui.maxSteps === true);
cek('toggle allowWrite ada', ui.allowWrite === true);
cek('toggle showPanel ada', ui.showPanel === true);
cek('toggle autoCollapse ada', ui.autoCollapse === true);

// ── V5: reset ke default lewat UI bisa dibalik ──
const reset = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SUBSET__;
  // Kembalikan ke default lewat jalur settings (yang dipakai UI).
  await S.set({ maxParallel: 4, maxSteps: 15, allowWrite: false, showPanel: true, autoCollapse: true });
  await new Promise((r) => setTimeout(r, 900));
  return { e: S.efektif(), s: S.baca() };
})())`, 90000);
cek('setting bisa dikembalikan ke default', reset.e.maxParallel === 4 && reset.e.maxSteps === 15 && reset.e.allowWrite === false,
  `paralel ${reset.e.maxParallel}, langkah ${reset.e.maxSteps}`);

// ── V6: panel compact — form tertutup secara default ──
const compact = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SETTINGS__;
  S.tutup();
  const T = window.__ZEPHYR_TERM__;
  // T4.1: UI subagent hidup di TAB Subagents. Di sana formnya SELALU terbuka
  // (itu tempatnya) — jadi yang diuji adalah keberadaan + tinggi wajarnya,
  // bukan "tertutup default" yang dulu berlaku saat ia masih di panel AI.
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1400));
  const form = document.querySelector('[data-testid="sub-form"]');
  const input = document.querySelector('[data-testid="sub-input"]');
  return {
    tombolAda: !!form,
    formTerbuka: !!form,
    tinggiInput: input ? Math.round(input.getBoundingClientRect().height) : 0,
    adaJudul: !!document.querySelector('.sub-form-judul'),
  };
})())`, 90000);
cek('form "Tugas paralel" ada', compact.tombolAda === true);
cek('form terbuka di tab Subagents', compact.formTerbuka === true);
cek('input tidak terlalu tinggi (compact)', compact.tinggiInput > 0 && compact.tinggiInput < 90, `${compact.tinggiInput}px`);

// ── V7: kartu subagent tidak mengulang hasil panjang ──
const kartu = await cdp.json(`return JSON.stringify(await (async () => {
  // Kartu perlu ada: jalankan satu subagent di tab ini dulu.
  const SUB = window.__ZEPHYR_SUB__;
  if (SUB.store.getState().agents.length === 0) {
    SUB.bersihkan();
    await new Promise((r) => setTimeout(r, 400));
    await SUB.store.getState().jalankan(['Balas satu kata: SATU']);
    const batas = Date.now() + 30000;
    while (Date.now() < batas && SUB.store.getState().sibuk) {
      await new Promise((r) => setTimeout(r, 300));
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  const k = document.querySelector('[data-testid^="sub-card-"]');
  if (!k) return { err: 'tidak ada kartu' };
  const hasil = k.querySelector('[data-testid^="sub-hasil-"]');
  const r = hasil ? hasil.getBoundingClientRect() : null;
  return {
    adaKartu: true,
    adaHasil: !!hasil,
    tinggiHasil: r ? Math.round(r.height) : 0,
    // Satu baris: tingginya harus di bawah ~30px, bukan blok paragraf.
    satuBaris: r ? r.height < 30 : true,
    nBaris: hasil ? hasil.textContent.trim().split('\\n').length : 0,
  };
})())`, 90000);
cek('kartu ada', kartu.adaKartu === true, kartu.err || '');
cek('hasil di kartu = SATU baris (tidak mengulang chat)', kartu.satuBaris === true,
  `${kartu.tinggiHasil}px`);

// ── V8: settings showPanel benar-benar menyembunyikan panel ──
const sembunyi = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SUBSET__;
  await S.set({ showPanel: false });
  await new Promise((r) => setTimeout(r, 1000));
  const ada = !!document.querySelector('[data-testid="sub-panel"]');
  await S.set({ showPanel: true });
  await new Promise((r) => setTimeout(r, 1000));
  const balik = !!document.querySelector('[data-testid="sub-panel"]');
  return { ada, balik };
})())`, 90000);
cek('showPanel=false menyembunyikan panel', sembunyi.ada === false);
cek('showPanel=true memunculkannya lagi', sembunyi.balik === true);

// ── bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_SUB__.bersihkan();
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
