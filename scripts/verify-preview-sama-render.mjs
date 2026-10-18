/*
 * PREVIEW vs HASIL KLIK: apakah sama?
 *
 * Kartu menghitung ikonnya sendiri dari peta paket (p.ikon). Yang DITERAPKAN
 * pohon berkas dihitung oleh fileIcons dari peta render. Kalau kedua jalur itu
 * memakai kunci atau aturan berbeda, preview menunjukkan satu gambar dan klik
 * menghasilkan gambar lain - persis yang dikeluhkan.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const st = await import('/src/lib/ikonTemaStore.ts');
  const loader = await import('/src/lib/extLoader.ts');
  const fi = await import('/src/lib/fileIcons.ts');
  await loader.muatSemuaEkstensi().catch(() => {});
  await tunggu(1500);

  const packs = st.useIkonTema.getState().packs;
  S.getState().setActivity('explorer');
  S.getState().setSidebarVisible(true);
  await tunggu(1500);

  const out = [];

  for (const p of packs) {
    /* A. JALUR PREVIEW - persis rumus yang dipakai kartu di IkonTemaSection. */
    const previewSrc =
      p.ikon['folder-open:src']?.svg ??
      p.ikon['folder:src']?.svg ??
      p.ikon['folder']?.svg ??
      null;
    const previewTsx = p.ikon['tsx']?.svg ?? null;

    /* B. JALUR RENDER - pilih paket, lalu baca apa yang fileIcons hasilkan. */
    st.useIkonTema.getState().pilih(p.extId);
    await tunggu(700);

    const renderSrc = fi.ikonFolder('src', false)?.svg ?? null;
    const renderTsx = fi.ikonFile('app.tsx', 'tsx')?.svg ?? null;

    /* C. DOM: baris `src` di pohon, kalau ada. */
    let domSrc = null;
    const baris = [...document.querySelectorAll('.tree-row')];
    for (const r of baris) {
      const nama = r.querySelector('.tree-name')?.textContent?.trim() ?? '';
      if (nama === 'src') {
        domSrc = r.querySelector('.tree-fikon svg')?.outerHTML ?? null;
        break;
      }
    }

    out.push({
      id: p.extId.replace('zephyr.ikon-', ''),
      label: p.label,
      /* Sidik jari pendek untuk dibandingkan. */
      previewSrc: (previewSrc ?? '').replace(/\\s+/g, '').length,
      renderSrc: (renderSrc ?? '').replace(/\\s+/g, '').length,
      samaFolder: !!previewSrc && previewSrc === renderSrc,
      samaBerkas: !!previewTsx && previewTsx === renderTsx,
      adaPreviewFolder: !!previewSrc,
      adaRenderFolder: !!renderSrc,
      adaDomSrc: !!domSrc,
      /* Kalau berbeda, tunjukkan bagian yang membedakan. */
      beda: previewSrc && renderSrc && previewSrc !== renderSrc
        ? { preview: previewSrc.slice(0, 100), render: renderSrc.slice(0, 100) }
        : null,
    });
  }

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  500000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log('tema        previewSrc renderSrc  folder-sama  berkas-sama  DOM-src');
for (const r of d) {
  console.log(
    `  ${r.id.padEnd(10)} ${String(r.previewSrc).padStart(6)}  ${String(r.renderSrc).padStart(6)}      ` +
      `${r.samaFolder ? 'YA  ' : 'TIDAK'}        ${r.samaBerkas ? 'YA  ' : 'TIDAK'}       ${r.adaDomSrc ? 'ya' : '-'}`,
  );
}

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti:');
cek('setiap paket punya preview folder', d.every((r) => r.adaPreviewFolder), `${d.filter((r) => r.adaPreviewFolder).length}/${d.length}`);
cek('setiap paket punya hasil render folder', d.every((r) => r.adaRenderFolder), `${d.filter((r) => r.adaRenderFolder).length}/${d.length}`);
cek('PREVIEW == RENDER untuk folder', d.every((r) => r.samaFolder), `${d.filter((r) => r.samaFolder).length}/${d.length}`);
cek('PREVIEW == RENDER untuk berkas', d.every((r) => r.samaBerkas), `${d.filter((r) => r.samaBerkas).length}/${d.length}`);

const beda = d.filter((r) => !r.samaFolder);
if (beda.length) {
  console.log('\n  Yang preview-nya BEDA dari hasil render:');
  for (const r of beda.slice(0, 3)) {
    console.log(`    ${r.id}:`);
    console.log(`      preview: ${r.beda?.preview ?? '(kosong)'}`);
    console.log(`      render : ${r.beda?.render ?? '(kosong)'}`);
  }
}

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
