// Bukti: pilihan ikon BERTAHAN setelah app di-restart.
//
// Dijalankan dua tahap oleh pemanggil:
//   node verify-ikon-persist.mjs set   -> pilih paket, laporkan id
//   (restart app)
//   node verify-ikon-persist.mjs cek   -> pastikan paket yang sama masih aktif
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const tahap = process.argv[2] ?? 'cek';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

if (tahap === 'set') {
  const h = await cdp.json(
    `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = await import('/src/lib/ikonTemaStore.ts');
  const loader = await import('/src/lib/extLoader.ts');
  const ex = await import('/src/lib/extIkonFile.ts');

  await loader.muatSemuaEkstensi().catch(() => {});
  await tunggu(1500);

  const p = st.useIkonTema.getState().packs;
  /* Pilih paket yang PUNYA folder, dan bukan yang sudah aktif - supaya
     perubahannya nyata, bukan kebetulan. */
  const target = p.find((x) => x.ikon.folder && x.extId !== st.useIkonTema.getState().aktif) ?? p[0];
  st.useIkonTema.getState().pilih(target.extId);
  loader.terapkanIkonTema(target.extId);
  await tunggu(600);

  return {
    dipilih: target.extId,
    glifFolder: ex.ikonFolderUmumExt(false)?.glyph ?? null,
    tersimpan: localStorage.getItem('zephyr.ikonTema.aktif'),
  };
})().catch((e) => ({ fatal: String(e) })))`,
    120000,
  );
  const d = typeof h === 'string' ? JSON.parse(h) : h;
  console.log('SET:', JSON.stringify(d));
  keluarBersih(d.fatal || !d.tersimpan ? 1 : 0);
}

const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = await import('/src/lib/ikonTemaStore.ts');
  const loader = await import('/src/lib/extLoader.ts');
  const ex = await import('/src/lib/extIkonFile.ts');
  const fi = await import('/src/lib/fileIcons.ts');

  /* TANPA memilih apa pun: baca keadaan yang dipulihkan dari storage. */
  await tunggu(1200);
  const s = st.useIkonTema.getState();

  return {
    aktif: s.aktif,
    dipilihManual: s.dipilihManual,
    petaJumlah: ex.jumlahIkonExt(),
    glifFolder: ex.ikonFolderUmumExt(false)?.glyph ?? null,
    ikonFolderSrc: fi.ikonFolder('src', false).id,
    ikonFileTs: fi.ikonFile('a.ts', 'ts').id,
  };
})().catch((e) => ({ fatal: String(e) })))`,
  120000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

const diharap = process.env.ZEPHYR_IKON_DIPILIH ?? '';
console.log('CEK:', JSON.stringify(d));

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti pilihan bertahan setelah restart:');
cek('paket yang dipilih dipulihkan', !!d.aktif, String(d.aktif));
cek('paket yang dipulihkan = yang dipilih', !diharap || d.aktif === diharap, `harap ${diharap}`);
cek('peta ikon terisi setelah restart', (d.petaJumlah ?? 0) > 0, String(d.petaJumlah));
cek('folder memakai ikon paket', (d.ikonFolderSrc ?? '').startsWith('ext:'), String(d.ikonFolderSrc));
cek('berkas memakai ikon paket', (d.ikonFileTs ?? '').startsWith('ext:'), String(d.ikonFileTs));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
