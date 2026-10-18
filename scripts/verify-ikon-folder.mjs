// Uji: pilih paket yang PUNYA ikon folder, lalu buktikan folder berubah.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const out = {};

  const ex = await import('/src/lib/extIkonFile.ts');
  const st = await import('/src/lib/ikonTemaStore.ts');
  const fi = await import('/src/lib/fileIcons.ts');
  const loader = await import('/src/lib/extLoader.ts');

  await loader.muatSemuaEkstensi().catch(() => {});
  await tunggu(1500);

  /* Cari paket yang punya kunci folder. */
  const paket = loader.daftarPaketIkon();
  out.semua = paket.map((p) => ({
    id: p.extId,
    total: Object.keys(p.ikon).length,
    punyaFolder: !!p.ikon.folder,
    punyaFolderOpen: !!p.ikon['folder-open'],
    contohFolderNames: Object.keys(p.ikon).filter((k) => k.startsWith('folder:')).slice(0, 4),
  }));

  const dgnFolder = paket.find((p) => p.ikon.folder);
  out.dipilih = dgnFolder?.extId ?? null;

  if (dgnFolder) {
    /* Sebelum: PAKSA kembali ke ikon bawaan dulu, supaya perubahannya terbukti
       dan bukan sisa run sebelumnya. */
    st.useIkonTema.getState().pilih(null);
    loader.terapkanIkonTema(null);
    await tunggu(300);
    out.sebelum = {
      folder: fi.ikonFolder('src', false).id,
      file: fi.ikonFile('app.ts', 'ts').id,
      petaJumlah: ex.jumlahIkonExt(),
    };

    /* Pilih lewat store (jalur yang dipakai halaman Icons). */
    st.useIkonTema.getState().pilih(dgnFolder.extId);
    loader.terapkanIkonTema(dgnFolder.extId);
    await tunggu(600);

    /* Sesudah. */
    const f = fi.ikonFolder('src', false);
    const fo = fi.ikonFolder('src', true);
    const n = fi.ikonFolder('node_modules', false);
    const t = fi.ikonFile('app.ts', 'ts');
    out.sesudah = {
      folder: { id: f.id, glif: f.glyph ?? null, svg: !!f.svg, warna: f.color ?? null },
      folderOpen: { id: fo.id, glif: fo.glyph ?? null },
      folderNode: { id: n.id, glif: n.glyph ?? null },
      file: { id: t.id, glif: t.glyph ?? null, svg: !!t.svg, warna: t.color ?? null },
      petaJumlah: ex.jumlahIkonExt(),
    };

    /* DOM: pohon berkas sungguhan.
     *
     * setActivity + setSidebarVisible(true), NOT a click on the rail button:
     * clicking that button while Explorer is already the active view TOGGLES the
     * sidebar closed, so a second run found an empty DOM and reported a bug that
     * was not there.
     *
     * The wait is a POLL for the pack's own label, not a fixed sleep: the swap
     * is committed by React after the map write, and reading too early reported
     * "no icon" for a row that was about to be painted. */
    S.getState().setActivity('explorer');
    S.getState().setSidebarVisible(true);
    const batas = performance.now() + 5000;
    while (performance.now() < batas) {
      await tunggu(120);
      const kini = document.querySelector('.tree-row .tree-fikon')?.getAttribute('data-ikon') ?? '';
      if (kini.includes(dgnFolder.label)) break;
    }
    const baris = [...document.querySelectorAll('.tree-row')].slice(0, 14);
    out.dom = baris.map((r) => {
      const el = r.querySelector('.tree-fikon');
      const svg = el?.querySelector('svg');
      return {
        nama: r.querySelector('.tree-name')?.textContent?.trim() ?? '',
        ikon: el?.getAttribute('data-ikon') ?? null,
        glif: el?.textContent?.trim() ?? null,
        /* The drawing itself: themes ship SVG now, so "has an icon" has to mean
           "has markup", not "has a character". */
        svg: (svg?.outerHTML ?? '').slice(0, 60),
      };
    });
  }

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  180000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log('Paket terpasang:');
for (const p of d.semua ?? []) {
  console.log(
    `  ${p.id.padEnd(34)} total=${String(p.total).padStart(2)} folder=${p.punyaFolder ? 'YA' : 'tidak'}` +
      (p.contohFolderNames.length ? `  nama=${p.contohFolderNames.join(',')}` : ''),
  );
}

console.log('\nPaket dipilih:', d.dipilih);
console.log('SEBELUM:', JSON.stringify(d.sebelum));
console.log('SESUDAH:', JSON.stringify(d.sesudah, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti:');
cek('ada paket dengan ikon folder', (d.semua ?? []).some((p) => p.punyaFolder));
cek('id folder BERUBAH', d.sebelum?.folder !== d.sesudah?.folder?.id, `${d.sebelum?.folder} -> ${d.sesudah?.folder?.id}`);
cek('folder punya gambar (svg)', !!d.sesudah?.folder?.svg || !!d.sesudah?.folder?.glif, d.sesudah?.folder?.svg ? 'svg' : String(d.sesudah?.folder?.glif));
cek('folder terbuka BERUBAH', d.sesudah?.folderOpen?.id !== d.sebelum?.folder);
cek('berkas punya gambar (svg)', !!d.sesudah?.file?.svg || !!d.sesudah?.file?.glif, d.sesudah?.file?.svg ? 'svg' : String(d.sesudah?.file?.glif));

/*
 * The DOM is the only place that proves the TREE changed, not just the lookup.
 * This is the assertion that would have caught the original bug: every folder row
 * must be drawn by the pack, not by Zephyr's built-in art.
 */
const domPaket = (d.dom ?? []).filter((x) => (x.ikon ?? '').startsWith('ext:'));
cek(
  'SETIAP baris folder di pohon memakai ikon paket',
  (d.dom ?? []).length > 0 && domPaket.length === (d.dom ?? []).length,
  `${domPaket.length}/${(d.dom ?? []).length}`,
);
cek(
  'folder benar-benar dirender',
  domPaket.length > 0 && domPaket.every((x) => !!x.glif || !!x.svg),
  domPaket.length ? `contoh "${domPaket[0].glif}" pada ${domPaket[0].nama}` : 'tidak ada',
);
for (const x of domPaket.slice(0, 8)) console.log(`    ${x.glif ?? '?'}  ${x.nama}  (${x.ikon})`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
