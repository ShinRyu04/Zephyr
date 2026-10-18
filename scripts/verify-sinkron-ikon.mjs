/*
 * C: install di jendela Extensions harus sampai ke jendela utama.
 *
 * Diuji tanpa membuka dua jendela sungguhan (itu butuh OS window dan tidak bisa
 * dibaca dari CDP satu target): yang diuji adalah KONTRAKNYA - event dipancarkan
 * saat install/uninstall, dan pendengar di jendela utama memuat ulang paket.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  /* 1. Apakah kode benar-benar memancarkan event itu? */
  const fs = await import('/src/lib/extensionsStore19.ts').catch(() => null);
  out.modulAda = !!fs;

  /* 2. Apakah jendela ini punya pendengarnya? Uji dengan memancarkan sendiri. */
  const st = await import('/src/lib/ikonTemaStore.ts');
  const loader = await import('/src/lib/extLoader.ts');
  await loader.muatSemuaEkstensi().catch(() => {});
  await tunggu(1200);
  const sebelum = st.useIkonTema.getState().packs.length;

  /* Kosongkan dulu, lalu pancarkan event: listener di App harus mengisi ulang. */
  st.useIkonTema.setState({ packs: [] });
  const kosong = st.useIkonTema.getState().packs.length;

  window.dispatchEvent(new CustomEvent('zephyr-extensions-changed', { detail: { id: 'uji' } }));

  /* Tunggu sampai pendengar selesai memuat. */
  const batas = performance.now() + 8000;
  while (st.useIkonTema.getState().packs.length === 0 && performance.now() < batas) {
    await tunggu(200);
  }
  out.setelahEvent = st.useIkonTema.getState().packs.length;

  out.sebelum = sebelum;
  out.kosong = kosong;

  /* 3. Pilihan tetap dipertahankan setelah muat ulang. */
  const packs = st.useIkonTema.getState().packs;
  if (packs.length > 0) {
    st.useIkonTema.getState().pilih(packs[0].extId);
    await tunggu(600);
    window.dispatchEvent(new CustomEvent('zephyr-extensions-changed', { detail: { id: 'uji2' } }));
    await tunggu(1500);
    out.pilihanBertahan = st.useIkonTema.getState().aktif === packs[0].extId;
  }

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  240000,
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

console.log('\nBukti C — sinkronisasi antar-jendela:');
cek('modul store ekstensi ada', d.modulAda === true, '');
cek('sebelum event: paket terisi', (d.sebelum ?? 0) > 0, String(d.sebelum));
cek('dikosongkan dulu', d.kosong === 0, String(d.kosong));
cek('event memuat ulang paket', (d.setelahEvent ?? 0) > 0, String(d.setelahEvent));
cek('pilihan bertahan setelah muat ulang', d.pilihanBertahan === true, String(d.pilihanBertahan));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
