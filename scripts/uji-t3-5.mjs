// uji-t3-5.mjs — verifikasi T3.5 Customize Layout (ala VS Code).
//
// UJI NYATA: setiap toggle diperiksa dari DOM (computed style), bukan dari
// state store saja — toggle yang mengubah state tapi tidak menyembunyikan
// elemennya adalah bug yang tidak terlihat dari store.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;

const cek = (nama, ok, info = '') => {
  if (ok) {
    lulus++;
    console.log(`  LULUS  ${nama}${info ? '  ' + info : ''}`);
  } else {
    gagal++;
    console.log(`  GAGAL  ${nama}${info ? '  ' + info : ''}`);
  }
};

/** Display dari sebuah selector; 'tidak-ada' kalau elemennya tidak ada. */
const disp = (sel) =>
  `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? getComputedStyle(e).display : 'tidak-ada'; })()`;

console.log('=== T3.5: Customize Layout ===\n');

// ── V1: tombol Customize Layout ada di title bar ──
const btn = await cdp.json(`return JSON.stringify({
  ada: !!document.querySelector('[data-testid="mb-customize-layout"]'),
  judul: document.querySelector('[data-testid="mb-customize-layout"]')?.getAttribute('title') || '',
})`);
cek('tombol Customize Layout ada di title bar', btn.ada === true, btn.judul);

// ── V2: klik membuka panel ──
const buka = await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="mb-customize-layout"]').click();
  await new Promise((r) => setTimeout(r, 600));
  const menu = document.querySelector('[data-testid="layout-menu"]');
  return {
    ada: !!menu,
    nBaris: document.querySelectorAll('[data-testid^="lm-"]').length,
    teks: (menu?.textContent || '').slice(0, 120),
  };
})())`, 60000);
cek('panel Customize Layout terbuka', buka.ada === true, buka.teks);
cek('panel memuat baris kontrol', buka.nBaris >= 8, `${buka.nBaris} elemen`);

// ── V3: setiap toggle BENAR-BENAR menyembunyikan elemennya ──
const baris = [
  { kunci: 'menuBar', sel: '.menubar', testid: 'lm-menuBar' },
  { kunci: 'activityBar', sel: '.activitybar', testid: 'lm-activityBar' },
  { kunci: 'sidebar', sel: '.sidebar', testid: 'lm-sidebar' },
  { kunci: 'statusBar', sel: '.statusbar', testid: 'lm-statusBar' },
];

for (const b of baris) {
  const r = await cdp.json(`return JSON.stringify(await (async () => {
    const L = window.__ZEPHYR_LAYOUT__;
    const sebelum = ${disp(b.sel)};
    L.toggle(${JSON.stringify(b.kunci)});
    await new Promise((r) => setTimeout(r, 500));
    const sesudah = ${disp(b.sel)};
    L.toggle(${JSON.stringify(b.kunci)});
    await new Promise((r) => setTimeout(r, 500));
    const kembali = ${disp(b.sel)};
    return { sebelum, sesudah, kembali };
  })())`, 60000);
  // React MENGHAPUS elemen dari DOM saat kondisinya false — bukan
  // display:none. Jadi 'tidak-ada' juga berarti tersembunyi.
  const sembunyi = r.sebelum !== 'none' && r.sebelum !== 'tidak-ada' &&
                   (r.sesudah === 'none' || r.sesudah === 'tidak-ada');
  const balik = r.kembali !== 'none';
  cek(`toggle ${b.kunci} menyembunyikan elemen`, sembunyi, `${r.sebelum} → ${r.sesudah}`);
  cek(`toggle ${b.kunci} bisa dikembalikan`, balik, `→ ${r.kembali}`);
}

// ── V4: posisi side bar kiri/kanan benar-benar mengubah layout ──
const pos = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const el = document.querySelector('.app-body');
  const kiri = el ? el.className : '';
  await S.getState().applySettings({ sidebar: 'right' });
  await new Promise((r) => setTimeout(r, 700));
  const kanan = document.querySelector('.app-body')?.className || '';
  await S.getState().applySettings({ sidebar: 'left' });
  await new Promise((r) => setTimeout(r, 600));
  return { kiri, kanan };
})())`, 90000);
cek('posisi side bar mengubah kelas layout',
  pos.kanan.includes('sidebar-pos-right') && pos.kiri.includes('sidebar-pos-left'),
  `${pos.kiri.slice(0, 44)} → ${pos.kanan.slice(0, 44)}`);

// ── V5: kerapatan compact menambahkan kelas ──
const rapat = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.set({ kerapatan: 'compact' });
  await new Promise((r) => setTimeout(r, 500));
  const a = document.querySelector('.app-body')?.className.includes('is-compact');
  L.set({ kerapatan: 'default' });
  await new Promise((r) => setTimeout(r, 400));
  const b = document.querySelector('.app-body')?.className.includes('is-compact');
  return { compact: a, normal: b };
})())`, 60000);
cek('kerapatan compact menambahkan kelas', rapat.compact === true);
cek('kerapatan normal menghapus kelas', rapat.normal === false);

// ── V6: tombol reset mengembalikan semua ──
const reset = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.set({ menuBar: false, activityBar: false, statusBar: false, sidebar: false });
  await new Promise((r) => setTimeout(r, 400));
  const sbelum = L.state();
  L.reset();
  await new Promise((r) => setTimeout(r, 400));
  const s = L.state();
  return {
    sebelum: { mb: sbelum.menuBar, ab: sbelum.activityBar, sb: sbelum.statusBar, sd: sbelum.sidebar },
    sesudah: { mb: s.menuBar, ab: s.activityBar, sb: s.statusBar, sd: s.sidebar },
  };
})())`, 60000);
cek('reset mengembalikan semua kontrol',
  reset.sesudah.mb && reset.sesudah.ab && reset.sesudah.sb && reset.sesudah.sd,
  JSON.stringify(reset.sesudah));

// ── V7: panel AI punya tombol sembunyikan ──
const ai = await cdp.json(`return JSON.stringify(await (async () => {
  TS().setVisible(true);
  TS().setDock('ai');
  await new Promise((r) => setTimeout(r, 700));
  const b = document.querySelector('[data-testid="ai-hide"]');
  if (!b) return { ada: false };
  const sebelum = TS().visible;
  b.click();
  await new Promise((r) => setTimeout(r, 600));
  const sesudah = TS().visible;
  TS().setVisible(true);
  return { ada: true, sebelum, sesudah };
})())`, 60000);
cek('tombol sembunyikan panel AI ada', ai.ada === true);
cek('tombol itu benar-benar menyembunyikan panel',
  ai.ada === true && ai.sebelum === true && ai.sesudah === false,
  `${ai.sebelum} → ${ai.sesudah}`);

// ── V8: command palette memuat command layout ──
const cp = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_CP__;
  P.open('command');
  P.setQuery('layout');
  await new Promise((r) => setTimeout(r, 500));
  const items = P.items().map((x) => (x && x.id) || x);
  P.close();
  return { items };
})())`, 60000);
cek('command "Customize Layout" ada di palette',
  Array.isArray(cp.items) && cp.items.includes('view.customizeLayout'),
  (cp.items || []).slice(0, 4).join(','));

// ── V9: simpan ke settings bertahan ──
const simpan = await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.set({ statusBar: false });
  await L.simpan();
  await new Promise((r) => setTimeout(r, 700));
  L.set({ statusBar: true });      // ubah dulu supaya muat() benar-benar mengubah
  await new Promise((r) => setTimeout(r, 200));
  await L.muat();
  await new Promise((r) => setTimeout(r, 400));
  const hasil = L.state().statusBar;
  L.set({ statusBar: true });
  await L.simpan();
  return { tersimpan: hasil };
})())`, 90000);
cek('pilihan layout tersimpan & bisa dimuat ulang', simpan.tersimpan === false,
  `statusBar setelah muat = ${simpan.tersimpan} (harus false)`);

// ── V10: bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.reset();
  await L.simpan();
  const menu = document.querySelector('[data-testid="layout-menu"]');
  if (menu) document.querySelector('[data-testid="lm-close"]')?.click();
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
