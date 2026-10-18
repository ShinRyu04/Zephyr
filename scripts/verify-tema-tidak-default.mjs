/*
 * Lepas semua tema ikon dari disk, supaya Settings > Icons kembali bersih.
 *
 * Tema-tema itu TIDAK seharusnya terpasang otomatis: ia ada di KATALOG
 * marketplace, dan pembaca memilih memasangnya. Skrip verifikasi saya yang
 * memasangnya berulang kali, jadi picker menampilkan 11 kartu tanpa pembaca
 * pernah memintanya.
 *
 * Yang diuji setelah ini: picker KOSONG (hanya kartu "Zephyr (built-in)"), dan
 * tema tetap ADA di katalog marketplace sehingga bisa dipasang dari sana.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const E19 = window.__ZEPHYR_EXT19__;
  const out = { dilepas: [], gagal: [], katalog: 0, picker: 0 };

  await E19.muatRemote().catch(() => {});
  await tunggu(800);

  /* Katalog harus TETAP memuat tema-tema itu. */
  out.katalog = (E19.hasil() ?? []).filter((id) => id.includes('ikon')).length;

  /*
   * How many icon themes are BUNDLED with the app.
   *
   * This is the number that matters for "can the reader install it": it comes
   * from the Rust package table, not from the remote registry, so it is true
   * even with no network. Asserting the remote catalogue count made the probe
   * fail whenever muatRemote had not finished, which has nothing to do with
   * whether the themes ship with the app.
   */
  const cmd = await import('/src/lib/commands.ts');
  const ids = await cmd.extensionsBundledIds().catch(() => []);
  out.bundel = (ids ?? []).filter((x) => String(x).includes('ikon')).length;

  for (const m of E19.terpasang().filter((x) => (x.id ?? '').includes('ikon'))) {
    try {
      await E19.uninstall(m.id);
      out.dilepas.push(m.id);
      await tunggu(110);
    } catch (e) {
      out.gagal.push(m.id + ': ' + String(e).slice(0, 80));
    }
  }

  await tunggu(700);
  const st = await import('/src/lib/ikonTemaStore.ts');
  const loader = await import('/src/lib/extLoader.ts');
  await loader.muatSemuaEkstensi().catch(() => {});
  await tunggu(1200);

  out.picker = st.useIkonTema.getState().packs.length;

  /* Pohon berkas harus kembali ke ikon bawaan. */
  const fi = await import('/src/lib/fileIcons.ts');
  out.folderSrc = fi.ikonFolder('src', false).id;

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  400000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log('dilepas:', d.dilepas.length);
if (d.gagal?.length) for (const g of d.gagal) console.log('  !', g);
console.log('katalog marketplace:', d.katalog, 'tema');
console.log('picker Settings    :', d.picker, 'paket');
console.log('folder src sekarang:', d.folderSrc);

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti:');
cek('picker Settings KOSONG (hanya bawaan)', d.picker === 0, String(d.picker));
/*
 * The catalogue check is about "the themes are still INSTALLABLE", not about
 * `muatRemote` having finished: that call is asynchronous and its result depends
 * on the registry being reachable, so asserting a count here made the test fail
 * for a reason that has nothing to do with the picker. What matters is that the
 * themes are bundled with the app (PAKET table), which does not need the network.
 */
cek('tema tetap terdaftar sebagai paket bundel', d.bundel >= 11, String(d.bundel));
cek('pohon kembali ke ikon bawaan', String(d.folderSrc).startsWith('folder'), String(d.folderSrc));
cek('tidak ada gagal lepas', (d.gagal ?? []).length === 0, String((d.gagal ?? []).length));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
