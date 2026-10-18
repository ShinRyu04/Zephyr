/*
 * Uji LANGSUNG: klik kartu tema -> apakah pohon berkas di jendela ini berubah?
 *
 * Ini meniru persis apa yang pembaca lakukan: pilih tema di store, lalu baca
 * DOM pohon berkas. Kalau SVG-nya tidak berubah, uji GAGAL.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const out = { tema: [] };

  const st = await import('/src/lib/ikonTemaStore.ts');
  const loader = await import('/src/lib/extLoader.ts');
  await loader.muatSemuaEkstensi().catch(() => {});
  await tunggu(1500);

  const packs = st.useIkonTema.getState().packs;
  out.jumlahPaket = packs.length;

  /* Pastikan explorer terbuka. */
  S.getState().setActivity('explorer');
  S.getState().setSidebarVisible(true);
  await tunggu(1500);

  /* Untuk setiap tema: pilih, TUNGGU sampai DOM berubah, baru baca. */
  for (const p of packs) {
    const sebelum = document.querySelector('.tree-row .tree-fikon')?.getAttribute('data-ikon') ?? '';
    st.useIkonTema.getState().pilih(p.extId);

    /*
     * Poll sampai id ikon menyebut paket ini.
     *
     * A fixed sleep read the DOM before React had committed the swap, so every
     * theme appeared "one behind" - which sent me chasing a rendering bug that
     * did not exist. The id on the element is the signal that the paint
     * happened, so wait for THAT rather than for a duration.
     */
    const batas = performance.now() + 4000;
    let siap = false;
    while (performance.now() < batas) {
      await tunggu(60);
      const kini = document.querySelector('.tree-row .tree-fikon')?.getAttribute('data-ikon') ?? '';
      if (kini.includes(p.label)) {
        siap = true;
        break;
      }
    }

    const baris = [...document.querySelectorAll('.tree-row')].slice(0, 6);
    const ikon = baris.map((r) => {
      const el = r.querySelector('.tree-fikon');
      const svg = el?.querySelector('svg');
      return {
        nama: r.querySelector('.tree-name')?.textContent?.trim() ?? '',
        id: el?.getAttribute('data-ikon') ?? null,
        /*
         * The FULL markup, not a prefix.
         *
         * Slicing the first N characters made four visibly different themes
         * compare equal, because they share a folder body and only differ later
         * in opacity / stroke style. A fingerprint has to cover the whole
         * drawing or it reports "identical" for themes that are not.
         */
        isi: (svg?.outerHTML ?? '').replace(/\\s+/g, ''),
        adaSvg: !!svg,
      };
    });
    out.tema.push({
      label: p.label,
      id: p.extId.replace('zephyr.ikon-', ''),
      siap,
      ikon,
      /* Sidik jari layar: kalau dua tema menghasilkan ini sama, layarnya sama. */
      layar: ikon.map((i) => i.isi).join('|'),
    });
  }

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  400000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log('paket:', d.jumlahPaket);
console.log('\nSidik layar per tema (baris pohon pertama):');
for (const t of d.tema ?? []) {
  console.log(`  ${t.id.padEnd(10)} ${(t.ikon[0]?.nama ?? '-').padEnd(12)} ${t.ikon[0]?.id ?? 'TANPA IKON'}`);
}

const sidik = (d.tema ?? []).map((t) => t.layar);
const unik = new Set(sidik).size;

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti:');
cek('11 tema ada', (d.tema ?? []).length === 11, String((d.tema ?? []).length));
cek('setiap baris punya SVG', (d.tema ?? []).every((t) => t.ikon.every((i) => i.adaSvg)), '');
cek('layar BERBEDA antar tema', unik === sidik.length, `${unik}/${sidik.length} unik`);

if (unik !== sidik.length) {
  console.log('\n  Tema yang layarnya SAMA:');
  const g = {};
  for (const t of d.tema ?? []) (g[t.layar] = g[t.layar] || []).push(t.id);
  for (const ks of Object.values(g)) if (ks.length > 1) console.log('    ' + ks.join(', '));
}

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
