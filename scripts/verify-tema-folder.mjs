// Bukti: 8 tema FOLDER asli, semua beda, dan berganti tanpa salah.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const q = (s) => document.querySelector(s);
  const out = {};

  const st = await import('/src/lib/ikonTemaStore.ts');
  const loader = await import('/src/lib/extLoader.ts');
  const fi = await import('/src/lib/fileIcons.ts');
  const ex = await import('/src/lib/extIkonFile.ts');

  localStorage.removeItem('zephyr.ikonTema.aktif');
  localStorage.removeItem('zephyr.ikonTema.dipilihManual');
  st.useIkonTema.setState({ aktif: null, dipilihManual: false });
  await loader.muatSemuaEkstensi().catch(() => {});
  await tunggu(1800);

  const packs = st.useIkonTema.getState().packs;
  out.paket = packs.map((p) => ({ id: p.extId, label: p.label, ikon: Object.keys(p.ikon).length }));

  /* Bawaan. */
  st.useIkonTema.getState().pilih(null);
  await tunggu(350);
  out.bawaan = {
    folder: fi.ikonFolder('src', false).id,
    berkas: fi.ikonFile('app.ts', 'ts').id,
  };

  /* Tiap tema: bentuk folder dan berkas, plus sidik jari SVG-nya. */
  out.perTema = [];
  for (const p of packs) {
    st.useIkonTema.getState().pilih(p.extId);
    await tunggu(300);
    const f = fi.ikonFolder('src', false);
    const fo = fi.ikonFolder('src', true);
    const d = fi.ikonFolder('docs', false);
    const t = fi.ikonFile('app.ts', 'ts');
    const s = {
      id: p.extId.replace('zephyr.ikon-', ''),
      folder: f.id,
      folderBuka: fo.id,
      folderDocs: d.id,
      berkas: t.id,
      svgFolder: (f.svg ?? '').length,
      svgBerkas: (t.svg ?? '').length,
      /* Sidik jari isi SVG: DUA tema yang gambarnya sama akan punya hash sama. */
      hashFolder: (f.svg ?? '').replace(/\\s+/g, '').slice(0, 200),
      hashBerkas: (t.svg ?? '').replace(/\\s+/g, '').slice(0, 200),
      /* Bentuk folder harus punya tab: path dengan 'H' + 'L' dan bukan poligon
         aneh. Yang diuji: ada path badan dan ada tab. */
      adaTab: /H6\\.2L7\\.6/.test(f.svg ?? ''),
    };
    s.sidik = s.hashFolder + '|' + s.hashBerkas;
    out.perTema.push(s);
  }

  /* Ganti cepat: hasil akhir harus tema terakhir. */
  const a = packs[0].extId;
  const b = packs[packs.length - 1].extId;
  for (const id of [a, b, a, b]) st.useIkonTema.getState().pilih(id);
  await tunggu(800);
  out.cepat = { dipilih: st.useIkonTema.getState().aktif, harap: b, cocok: st.useIkonTema.getState().aktif === b };

  /* DOM. */
  S.getState().setActivity('explorer');
  S.getState().setSidebarVisible(true);
  await tunggu(2000);
  const baris = [...document.querySelectorAll('.tree-row')].slice(0, 16);
  out.dom = baris.map((r) => ({
    nama: r.querySelector('.tree-name')?.textContent?.trim() ?? '',
    ikon: r.querySelector('.tree-fikon')?.getAttribute('data-ikon') ?? null,
    svg: !!r.querySelector('.tree-fikon svg'),
  }));

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  300000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('Paket:', (d.paket ?? []).length);
for (const p of d.paket ?? []) console.log(`  ${p.id.replace('zephyr.ikon-', '').padEnd(10)} ${p.label.padEnd(10)} ${p.ikon} ikon`);
console.log('\nBawaan:', JSON.stringify(d.bawaan));
console.log('\nPer tema:');
for (const t of d.perTema ?? []) {
  console.log(`  ${t.id.padEnd(10)} folder=${t.folder}  buka=${t.folderBuka}  docs=${t.folderDocs}  svgFolder=${t.svgFolder}B`);
}

const sidik = (d.perTema ?? []).map((t) => t.sidik);
console.log('\nBukti:');
cek('8 tema terpasang', (d.paket ?? []).length === 8, String((d.paket ?? []).length));
cek('SEMUA tema menghasilkan ikon BERBEDA', new Set(sidik).size === sidik.length, `${new Set(sidik).size}/${sidik.length} unik`);
cek('setiap tema punya SVG folder', (d.perTema ?? []).every((t) => t.svgFolder > 200), (d.perTema ?? []).map((t) => t.svgFolder).join(','));
cek('setiap tema punya SVG berkas', (d.perTema ?? []).every((t) => t.svgBerkas > 150), (d.perTema ?? []).map((t) => t.svgBerkas).join(','));
cek('SEMUA tema BERBENTUK FOLDER (ada tab)', (d.perTema ?? []).every((t) => t.adaTab), `${(d.perTema ?? []).filter((t) => t.adaTab).length}/${(d.perTema ?? []).length}`);
cek('folder berubah dari bawaan', (d.perTema ?? []).every((t) => t.folder !== d.bawaan?.folder), `${d.bawaan?.folder} -> ${(d.perTema ?? [])[0]?.folder}`);
cek('berkas berubah dari bawaan', (d.perTema ?? []).every((t) => t.berkas !== d.bawaan?.berkas), '');
cek('folder TERBUKA beda dari tertutup', (d.perTema ?? []).every((t) => t.folderBuka !== t.folder), `${(d.perTema ?? [])[0]?.folder} vs ${(d.perTema ?? [])[0]?.folderBuka}`);
cek('folder src beda dari docs', (d.perTema ?? []).every((t) => t.folder !== t.folderDocs), '');
cek('ganti cepat 4x -> tema terakhir', d.cepat?.cocok === true, String(d.cepat?.dipilih));

const domPaket = (d.dom ?? []).filter((x) => (x.ikon ?? '').startsWith('ext:'));
cek('SEMUA baris pohon pakai tema', (d.dom ?? []).length > 0 && domPaket.length === (d.dom ?? []).length, `${domPaket.length}/${(d.dom ?? []).length}`);
cek('ikon dirender SVG di layar', domPaket.length > 0 && domPaket.every((x) => x.svg), `${domPaket.filter((x) => x.svg).length}/${domPaket.length}`);

for (const x of (d.dom ?? []).slice(0, 10)) console.log(`    ${x.svg ? '[svg]' : '·'}  ${x.nama.padEnd(14)} ${x.ikon}`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
