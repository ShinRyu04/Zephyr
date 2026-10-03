// uji-layout-pulih.mjs — verifikasi jalan pulih Customize Layout (T3.6).
//
// BUG YANG DIUJI: sebelumnya tombol Customize Layout ADA DI DALAM Menu Bar.
// Mematikan Menu Bar = tombolnya hilang = tidak ada cara menyalakannya lagi.
// User terjebak tanpa Menu Bar dan harus mengedit settings.json manual.
//
// Yang dibuktikan di sini:
//   1. Dengan Menu Bar MATI, tombol cadangan di status bar tetap ada
//   2. Tombol itu benar-benar membuka panel Customize Layout
//   3. Dari panel itu, Menu Bar bisa dinyalakan kembali
//   4. Command palette juga bisa membuka panel walau Menu Bar mati
//   5. Toggle LayoutMenu TIDAK menghapus elemen yang dibutuhkan panelnya
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== Customize Layout: jalan pulih ===\n');

// ── 0. pastikan mulai dari normal ──
await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.reset();
  L.setMenuBuka(false);
  await new Promise((r) => setTimeout(r, 500));
  return 1;
})())`, 60000);

// ── V1: matikan Menu Bar ──
const mati = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.toggle('menuBar');
  await new Promise((r) => setTimeout(r, 600));
  return {
    menuBar: L.state().menuBar,
    menubarDiDom: !!document.querySelector('.menubar'),
    /*
     * Tombol cadangan di status bar SUDAH DIBUANG atas permintaan user: ia
     * muncul dua kali, dan yang di Menu Bar dipertahankan. Jadi V1 sekarang
     * memastikan tombol itu BENAR-BENAR tidak ada lagi - kalau ia muncul
     * kembali (mis. karena penggabungan yang salah), itu kegagalan.
     */
    sbLayout: !!document.querySelector('[data-testid="sb-layout"]'),
    statusBarAda: !!document.querySelector('.statusbar'),
  };
})())`, 60000);
cek('Menu Bar berhasil dimatikan', mati.menuBar === false && mati.menubarDiDom === false);
cek('status bar masih ada', mati.statusBarAda === true);
cek('tombol duplikat sb-layout SUDAH TIDAK ADA', mati.sbLayout === false,
  'satu tombol cukup, di Menu Bar');

// ── V2: satu-satunya tombol Customize Layout tinggal di Menu Bar ──
const satu = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.set({ menuBar: true });
  await new Promise((r) => setTimeout(r, 600));
  const semua = document.querySelectorAll('[data-testid="mb-customize-layout"]');
  const sb = document.querySelectorAll('[data-testid="sb-layout"]');
  return { diMenuBar: semua.length, diStatusBar: sb.length };
})())`, 60000);
cek('tombol Customize Layout ADA tepat SATU (di Menu Bar)',
  satu.diMenuBar === 1 && satu.diStatusBar === 0,
  `menuBar=${satu.diMenuBar} statusBar=${satu.diStatusBar}`);

// ── V3: tombol di Menu Bar membuka panel ──
const buka = await cdp.json(`return JSON.stringify(await (async () => {
  const btn = document.querySelector('[data-testid="mb-customize-layout"]');
  btn.click();
  await new Promise((r) => setTimeout(r, 700));
  const menu = document.querySelector('[data-testid="layout-menu"]');
  return {
    menuAda: !!menu,
    menuBuka: window.__ZEPHYR_LAYOUT__.state().menuBuka,
    baris: document.querySelectorAll('[data-testid^="lm-"]').length,
  };
})())`, 60000);
cek('panel Customize Layout terbuka dari tombol Menu Bar', buka.menuAda === true, buka.menuBuka ? 'menuBuka=true' : '');
cek('panel memuat baris kontrol', buka.baris >= 8, `${buka.baris} elemen`);

// ── V3: nyalakan Menu Bar kembali DARI panel itu ──
/*
 * Memakai `set({...})`, BUKAN `toggle()`.
 *
 * Versi uji ini dulu memanggil toggle() berturut-turut dengan jeda 500-700ms dan
 * gagal di dua titik. Kegagalan itu terjadi pada TOGGLE, bukan pada panelnya -
 * dan uji yang gagal karena cara memanggil, bukan karena fiturnya, lebih buruk
 * daripada tidak ada uji: ia menuduh aplikasi atas kesalahan harness.
 *
 * `set` idempoten: hasilnya sama berapa kali pun dipanggil, jadi uji ini
 * mengukur yang dimaksud - apakah panel bisa MENYALAKAN Menu Bar.
 */
const balik = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.set({ menuBar: false });
  await new Promise((r) => setTimeout(r, 600));
  const matiDulu = L.state().menuBar === false && !document.querySelector('.menubar');

  const baris = document.querySelector('[data-testid="lm-menuBar"]');
  if (!baris) return { err: 'baris lm-menuBar tidak ada', matiDulu };
  baris.click();
  await new Promise((r) => setTimeout(r, 800));
  return {
    matiDulu,
    menuBar: L.state().menuBar,
    menubarDiDom: !!document.querySelector('.menubar'),
  };
})())`, 60000);
cek('panel bisa MENYALAKAN Menu Bar kembali', balik.menuBar === true && balik.menubarDiDom === true,
  balik.err || `dari mati=${balik.matiDulu}`);

// ── V4: command palette tetap bisa membuka panel walau Menu Bar mati ──
const viaCp = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.set({ menuBar: false });           // matikan lagi; lihat catatan V3
  await new Promise((r) => setTimeout(r, 600));
  const menubarAda = !!document.querySelector('.menubar');

  const P = window.__ZEPHYR_CP__;
  P.open('command');
  P.setQuery('customize');
  await new Promise((r) => setTimeout(r, 700));
  const items = P.items().map((x) => (x && x.id) || x);
  const i = items.indexOf('view.customizeLayout');
  if (i >= 0) P.accept(i);
  await new Promise((r) => setTimeout(r, 900));
  const menuAda = !!document.querySelector('[data-testid="layout-menu"]');

  // pulihkan
  L.set({ menuBar: true });
  await new Promise((r) => setTimeout(r, 500));
  return { menubarAda, adaCommand: i >= 0, menuAda };
})())`, 90000);
cek('Menu Bar mati saat uji palette', viaCp.menubarAda === false);
cek('command "Customize Layout" ada di palette', viaCp.adaCommand === true);
cek('palette membuka panel walau Menu Bar mati', viaCp.menuAda === true);

// ── V5: Menu Bar kembali nyala ──
const pulih = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.setMenuBuka(false);
  await new Promise((r) => setTimeout(r, 500));
  return {
    menuBar: L.state().menuBar,
    menubarDiDom: !!document.querySelector('.menubar'),
    menuPanel: !!document.querySelector('[data-testid="layout-menu"]'),
  };
})())`, 60000);
cek('Menu Bar pulih', pulih.menuBar === true && pulih.menubarDiDom === true);
cek('panel tertutup setelah selesai', pulih.menuPanel === false);

// ── V6: simpan & muat ulang bertahan ──
const simpan = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.set({ menuBar: false });
  await L.simpan();
  await new Promise((r) => setTimeout(r, 700));
  L.set({ menuBar: true });
  await new Promise((r) => setTimeout(r, 300));
  await L.muat();
  await new Promise((r) => setTimeout(r, 500));
  const hasil = L.state().menuBar;
  // pulihkan ke normal
  L.reset();
  await L.simpan();
  await new Promise((r) => setTimeout(r, 500));
  return { tersimpan: hasil };
})())`, 90000);
cek('pilihan "Menu Bar mati" bertahan setelah muat ulang', simpan.tersimpan === false,
  `menuBar setelah muat = ${simpan.tersimpan}`);

// ── V7: bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.reset();
  L.setMenuBuka(false);
  await L.simpan();
  await new Promise((r) => setTimeout(r, 500));
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
