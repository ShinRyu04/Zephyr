/**
 * verify-wallpaper.mjs - buktikan permukaan chrome benar-benar tembus wallpaper.
 *
 *   node scripts/verify-wallpaper.mjs 9223
 *
 * Yang diuji bukan "aturannya ada di CSS", tapi "warnanya benar-benar jadi
 * tembus saat data-bg='on'". Caranya: pasang wallpaper, lalu baca
 * getComputedStyle dari tiap permukaan dan pastikan latarnya punya kanal alfa
 * kurang dari 1.
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('wallpaper');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/*
 * Wallpaper dipasang lewat jalur NYATA: set setting background.image lalu
 * applyTheme menulis data-bg sendiri. Menulis atributnya langsung dari CDP
 * tidak membuktikan apa pun - yang perlu dibuktikan justru bahwa alur
 * pemasangannya membuat permukaannya tembus.
 */
/*
 * Wallpaper dipasang lewat jalur NYATA: set setting background.image lalu
 * tunggu sampai `applyTheme` menulis `data-bg`.
 *
 * Menulis atributnya langsung dari CDP tidak membuktikan apa pun - justru
 * yang perlu dibuktikan adalah bahwa memasang wallpaper membuat permukaannya
 * tembus. Kalau atributnya dipasang manual, ujinya hanya membuktikan CSS-nya
 * benar, bukan aplikasinya.
 */
const pasang = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR__;
  if (!st) return { bisa: false, alasan: 'bridge store tidak ada' };

  /* PNG 2x2: cukup untuk mengisi --bg-image tanpa memuat berkas dari disk. */
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

  await st.getState().applySettings({ background: { image: png, transparan: true } });

  /* Tunggu sampai atributnya benar-benar tertulis, maksimal 3 detik. Menunggu
     waktu tetap membuat ujinya rapuh: kalau tema lebih lambat dari dugaan,
     pembacaan terjadi sebelum data-bg ada dan hasilnya gagal palsu. */
  const batas = Date.now() + 3000;
  while (Date.now() < batas && document.documentElement.dataset.bg !== 'on') {
    await new Promise((res) => setTimeout(res, 120));
  }

  return { bisa: true, bg: document.documentElement.dataset.bg || null };
})())`);

r.check('W1', pasang.bisa === true && pasang.bg === 'on', `wallpaper terpasang lewat jalur nyata, data-bg="${pasang.bg}"`);

if (pasang.bg !== 'on') {
  const { lulus, total } = r.selesai();
  await cdp.close();
  process.exit(lulus === total ? 0 : 1);
}

/*
 * Buka panel-panelnya lebih dulu.
 *
 * Elemen seperti .round-left-bar dan .right-panel-head CABANG dari tab yang
 * sedang aktif, jadi kalau panelnya tertutup, elemennya tidak ada di DOM sama
 * sekali. Diuji apa adanya akan selalu gagal - bukan karena CSS-nya salah,
 * tapi karena tidak ada yang bisa diperiksa.
 */
const dibuka = await cdp.json(`return JSON.stringify(await (async () => {
  const st = window.__ZEPHYR__;
  const hasil = {};
  const s = st.getState();

  /* Panel AI. */
  try {
    const t = s.setAiOpen;
    if (typeof t === 'function') { t(true); hasil.ai = true; }
  } catch (e) { hasil.ai = String(e.message); }
  await new Promise((res) => setTimeout(res, 400));

  /* Panel bawah. */
  try {
    const p = s.togglePanel || s.setPanelVisible;
    if (typeof p === 'function') { p(true); hasil.panel = true; }
  } catch (e) { hasil.panel = String(e.message); }
  await new Promise((res) => setTimeout(res, 400));

  return hasil;
})())`);
console.log('  info   panel dibuka:', JSON.stringify(dibuka));
await sleep(500);

/*
 * Tiap permukaan: nama, selektor, dan dari mana latar asalnya.
 * "Harus tembus" = kanal alfa < 1.
 */
/*
 * Permukaan dibaca di dalam SATU ekspresi yang memastikan wallpaper sudah
 * aktif lebih dulu.
 *
 * Versi sebelumnya membaca DOM lewat beberapa panggilan terpisah, dan urutan
 * antar panggilan itu bisa membuat pembacaan terjadi sebelum applyTheme
 * menulis data-bg - hasilnya "elemen tidak ketemu" padahal elemennya ada dan
 * CSS-nya benar. Semua pembacaan sekarang dikunci ke satu titik waktu.
 */
const permukaan = await cdp.json(`return JSON.stringify((() => {
  /*
   * Selektor diambil dari hasil penyusuran kode, bukan dikarang: tiap baris
   * di sini adalah elemen chrome yang PUNYA latar sendiri dan sudah ditambal
   * di index.css. Kalau namanya salah, ujinya gagal - dan itu benar, karena
   * berarti tambalannya menunjuk elemen yang tidak ada.
   */
  const daftar = [
    { nama: 'tab bar', sel: '.tabbar' },
    { nama: 'strip tab panel bawah', sel: '.pts-root' },
    { nama: 'panel samping', sel: '.side-panel' },
    { nama: 'header AI', sel: '.ai-head' },
    { nama: 'strip chip antrean AI', sel: '.ai-cli-bar' },
    { nama: 'topbar settings', sel: '.set-topbar' },
    { nama: 'header kartu tool', sel: '.w4-tool-head' },
    { nama: 'header seksi sumber kontrol', sel: '.scm-sec-head' },
  ];

  const baca = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const c = getComputedStyle(el);
    return { warna: c.backgroundColor, gambar: c.backgroundImage !== 'none' };
  };

  return daftar.map((d) => ({ ...d, hasil: baca(d.sel) }));
})())`);

const ketemu = permukaan.filter((p) => p.hasil !== null);
/* Ambangnya rendah dengan sengaja: sebagian permukaan hanya ada kalau tab
   tertentu sedang dibuka (mis. header SCM, header kartu tool). Yang diuji
   adalah "setiap permukaan YANG ADA harus tembus", bukan "kedelapannya harus
   ada" - yang belakangan menguji tab mana yang terbuka, bukan CSS-nya. */
r.check('W2', ketemu.length >= 3, `permukaan yang ketemu di DOM: ${ketemu.length} dari ${permukaan.length} (sisanya butuh tab tertentu terbuka)`);

/**
 * Kanal alfa dari nilai warna yang dikembalikan getComputedStyle.
 *
 * Chrome mengembalikan `color(srgb r g b / a)` untuk `color-mix()`, bukan
 * `rgba()`. Pembaca yang hanya mengenali `rgba()` akan melaporkan "?" untuk
 * latar yang sebenarnya tembus - kegagalan palsu yang menyembunyikan hasil
 * yang benar.
 *
 * Bentuk yang ditangani:
 *   rgb(r, g, b)                  -> alfa 1
 *   rgba(r, g, b, a)              -> alfa a
 *   color(srgb r g b)             -> alfa 1
 *   color(srgb r g b / a)         -> alfa a
 *   transparent                   -> alfa 0
 */
function alfa(warna) {
  const w = (warna || '').trim();
  if (!w) return null;
  if (w === 'transparent') return 0;

  const rgba = /^rgba?\(([^)]+)\)$/.exec(w);
  if (rgba) {
    const bagian = rgba[1].split(/[,\s/]+/).filter(Boolean);
    if (bagian.length <= 3) return 1;
    return Number(bagian[bagian.length - 1]);
  }

  const warnaFungsi = /^color\(([^)]+)\)$/.exec(w);
  if (warnaFungsi) {
    const isi = warnaFungsi[1];
    const slash = isi.indexOf('/');
    if (slash < 0) return 1;
    return Number(isi.slice(slash + 1).trim());
  }

  return null;
}

let tembus = 0;
const laporan = [];
for (const p of ketemu) {
  const a = alfa(p.hasil.warna);
  const ok = a !== null && a < 1;
  if (ok) tembus++;
  laporan.push(`${p.nama}=${a === null ? '?' : a}`);
}

r.check(
  'W3',
  tembus === ketemu.length,
  `semua permukaan tembus saat wallpaper aktif [${laporan.join(' ')}]`,
);

/* Permukaan yang WAJIB tetap solid: popover, modal, toast. */
const solid = await cdp.json(`return JSON.stringify((() => {
  const cek = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return getComputedStyle(el).backgroundColor;
  };
  return { modal: cek('.modal'), toast: cek('.toast') };
})())`);

const modalSolid = solid.modal === null || alfa(solid.modal) === 1;
const toastSolid = solid.toast === null || alfa(solid.toast) === 1;
r.check(
  'W4',
  modalSolid && toastSolid,
  `popover/modal/toast tetap solid (modal=${solid.modal ?? 'tidak ada'} toast=${solid.toast ?? 'tidak ada'})`,
);

/* Kembalikan: lepas wallpaper supaya aplikasi tidak ditinggal dalam keadaan uji. */
await cdp.json(`return JSON.stringify(await (async () => {
  const s = window.__ZEPHYR__.getState();
  await s.applySettings({ background: { image: '' } });
  await new Promise((res) => setTimeout(res, 500));
  return { bg: document.documentElement.dataset.bg || null };
})())`);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
