/*
 * Alur lengkap: pasang dari MARKETPLACE -> muncul di Settings -> pilih -> berubah.
 *
 * Inilah yang diminta: tema ikon BUKAN bawaan, tapi tersedia di Extensions dan
 * berfungsi penuh setelah dipasang dari sana.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const E19 = window.__ZEPHYR_EXT19__;
  const st = await import('/src/lib/ikonTemaStore.ts');
  const fi = await import('/src/lib/fileIcons.ts');
  const out = {};

  await E19.muatRemote().catch(() => {});
  await tunggu(700);

  /* 0. Sebelum: picker kosong. */
  out.sebelum = st.useIkonTema.getState().packs.length;

  /* 1. Pasang SATU tema dari katalog marketplace (jalur yang dipakai tombol Install). */
  const id = 'zephyr.ikon-kanji';
  out.pasang = await E19.installKatalog(id).catch((e) => 'ERR ' + String(e));
  await tunggu(1800);

  /* 2. Muncul di picker Settings? */
  out.setelahPasang = st.useIkonTema.getState().packs.map((p) => p.label);

  /* 3. Pilih, lalu ukur layar. */
  const paket = st.useIkonTema.getState().packs[0];
  let berubah = false;
  if (paket) {
    st.useIkonTema.getState().pilih(paket.extId);
    await tunggu(900);
    const f = fi.ikonFolder('src', false);
    berubah = String(f.id).includes(paket.label);
    out.ikonSrc = f.id;
  }

  S.getState().setActivity('explorer');
  S.getState().setSidebarVisible(true);
  await tunggu(1500);
  const el = document.querySelector('.tree-row .tree-fikon');
  out.domIkon = el?.getAttribute('data-ikon') ?? null;
  out.adaSvg = !!el?.querySelector('svg');

  out.berubah = berubah;
  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  400000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti alur marketplace:');
cek('sebelum pasang: picker kosong', d.sebelum === 0, String(d.sebelum));
cek('install dari katalog berhasil', d.pasang === true, String(d.pasang));
cek('muncul di picker Settings', (d.setelahPasang ?? []).length === 1, JSON.stringify(d.setelahPasang));
cek('dipilih -> ikon berubah', d.berubah === true, String(d.ikonSrc));
cek('pohon memakai SVG tema', d.adaSvg === true, String(d.domIkon));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
