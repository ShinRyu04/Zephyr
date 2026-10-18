// Bukti: SEMUA ikon berubah (berkas + folder), tiap paket BERBEDA, dan ganti
// cepat tidak pernah meninggalkan paket yang salah di layar.
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

  /* Bersihkan pilihan lama supaya pengukuran mulai dari keadaan bawaan. */
  localStorage.removeItem('zephyr.ikonTema.aktif');
  localStorage.removeItem('zephyr.ikonTema.dipilihManual');
  st.useIkonTema.setState({ aktif: null, dipilihManual: false, packs: [] });
  await loader.muatSemuaEkstensi().catch(() => {});
  await tunggu(2000);

  const packs = st.useIkonTema.getState().packs;
  out.paket = packs.map((p) => ({
    id: p.extId,
    label: p.label,
    ikon: Object.keys(p.ikon).length,
    svg: Object.keys(p.ikon).filter((k) => p.ikon[k].svg).length,
  }));

  /* Bawaan dulu. */
  st.useIkonTema.getState().pilih(null);
  await tunggu(400);
  out.bawaan = {
    folderSrc: fi.ikonFolder('src', false).id,
    folderDocs: fi.ikonFolder('docs', false).id,
    fileTs: fi.ikonFile('app.ts', 'ts').id,
    filePkg: fi.ikonFile('package.json', 'json').id,
    fileDocker: fi.ikonFile('Dockerfile', '').id,
  };

  /* Setiap paket: ambil ikon beberapa jenis, dan sidik jarinya. */
  out.perPaket = [];
  for (const p of packs) {
    st.useIkonTema.getState().pilih(p.extId);
    await tunggu(350);
    const s = {
      id: p.extId,
      folderSrc: fi.ikonFolder('src', false).id,
      folderDocs: fi.ikonFolder('docs', false).id,
      folderSrcBuka: fi.ikonFolder('src', true).id,
      fileTs: fi.ikonFile('app.ts', 'ts').id,
      filePkg: fi.ikonFile('package.json', 'json').id,
      fileDocker: fi.ikonFile('Dockerfile', '').id,
      fileMd: fi.ikonFile('README.md', 'md').id,
      svgFolder: !!fi.ikonFolder('src', false).svg,
      svgFile: !!fi.ikonFile('app.ts', 'ts').svg,
    };
    /* Sidik jari: gabungan id semua yang diukur. Dua paket harus berbeda. */
    s.sidik = [s.folderSrc, s.folderDocs, s.fileTs, s.filePkg, s.fileDocker, s.fileMd].join('|');
    out.perPaket.push(s);
  }

  /* Ganti CEPAT berturut-turut: hasil akhir harus paket TERAKHIR. */
  const a = packs[0].extId;
  const b = packs[packs.length - 1].extId;
  st.useIkonTema.getState().pilih(a);
  st.useIkonTema.getState().pilih(b);
  st.useIkonTema.getState().pilih(a);
  st.useIkonTema.getState().pilih(b);
  await tunggu(900);
  out.cepat = {
    dipilih: st.useIkonTema.getState().aktif,
    harap: b,
    petaJumlah: ex.jumlahIkonExt(),
    folderSrc: fi.ikonFolder('src', false).id,
    cocok: st.useIkonTema.getState().aktif === b,
  };

  /* DOM: semua baris harus memakai ikon paket. */
  S.getState().setActivity('explorer');
  S.getState().setSidebarVisible(true);
  await tunggu(2000);
  const baris = [...document.querySelectorAll('.tree-row')].slice(0, 20);
  out.dom = baris.map((r) => ({
    nama: r.querySelector('.tree-name')?.textContent?.trim() ?? '',
    ikon: r.querySelector('.tree-fikon')?.getAttribute('data-ikon') ?? null,
    adaSvg: !!r.querySelector('.tree-fikon svg'),
    glif: r.querySelector('.tree-fikon')?.textContent?.trim() ?? null,
  }));

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  240000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('Paket terpasang:', d.paket?.length);
for (const p of d.paket ?? []) console.log(`  ${p.id.padEnd(26)} ${String(p.ikon).padStart(3)} ikon, ${String(p.svg).padStart(3)} SVG`);

console.log('\nBawaan:', JSON.stringify(d.bawaan));
console.log('\nPer paket (yang harus BEDA satu sama lain):');
for (const s of d.perPaket ?? []) {
  console.log(`  ${s.id.replace('zephyr.ikon-', '').padEnd(11)} folder=${s.folderSrc} docs=${s.folderDocs} ts=${s.fileTs} pkg=${s.filePkg} docker=${s.fileDocker}`);
}

console.log('\nBukti:');
cek('ada 8 paket', (d.paket ?? []).length === 8, String((d.paket ?? []).length));
cek('setiap paket punya SVG (bukan glyph)', (d.paket ?? []).every((p) => p.svg > 0), (d.paket ?? []).map((p) => p.svg).join(','));

const sidik = (d.perPaket ?? []).map((s) => s.sidik);
cek('SEMUA paket menghasilkan ikon BERBEDA', new Set(sidik).size === sidik.length, `${new Set(sidik).size}/${sidik.length} unik`);

const ubah = (d.perPaket ?? []).filter((s) => s.folderSrc !== d.bawaan?.folderSrc);
cek('folder berubah dari bawaan', ubah.length === (d.perPaket ?? []).length, `${ubah.length}/${(d.perPaket ?? []).length}`);

const ubahFile = (d.perPaket ?? []).filter((s) => s.fileTs !== d.bawaan?.fileTs);
cek('berkas .ts berubah dari bawaan', ubahFile.length === (d.perPaket ?? []).length, `${ubahFile.length}/${(d.perPaket ?? []).length}`);

const ubahPkg = (d.perPaket ?? []).filter((s) => s.filePkg !== d.bawaan?.filePkg);
cek('package.json berubah dari bawaan', ubahPkg.length === (d.perPaket ?? []).length, `${ubahPkg.length}/${(d.perPaket ?? []).length}`);

const ubahDocker = (d.perPaket ?? []).filter((s) => s.fileDocker !== d.bawaan?.fileDocker);
cek('Dockerfile (tanpa titik) berubah', ubahDocker.length === (d.perPaket ?? []).length, `${ubahDocker.length}/${(d.perPaket ?? []).length}`);

cek('folder TERBUKA beda dari tertutup', (d.perPaket ?? []).every((s) => s.folderSrcBuka !== s.folderSrc), (d.perPaket ?? [])[0] ? `${(d.perPaket ?? [])[0].folderSrc} vs ${(d.perPaket ?? [])[0].folderSrcBuka}` : '');

cek('folder src BEDA dari docs (per kelompok)', (d.perPaket ?? []).every((s) => s.folderSrc !== s.folderDocs), (d.perPaket ?? [])[0] ? `${(d.perPaket ?? [])[0].folderSrc} vs ${(d.perPaket ?? [])[0].folderDocs}` : '');

cek('ganti cepat 4x -> paket terakhir menang', d.cepat?.cocok === true, `${d.cepat?.dipilih} (harap ${d.cepat?.harap})`);

const domPaket = (d.dom ?? []).filter((x) => (x.ikon ?? '').startsWith('ext:'));
cek('SEMUA baris pohon pakai ikon paket', (d.dom ?? []).length > 0 && domPaket.length === (d.dom ?? []).length, `${domPaket.length}/${(d.dom ?? []).length}`);
cek('ikon dirender sebagai SVG di layar', domPaket.length > 0 && domPaket.every((x) => x.adaSvg), `${domPaket.filter((x) => x.adaSvg).length}/${domPaket.length}`);

for (const x of (d.dom ?? []).slice(0, 12)) console.log(`    ${x.adaSvg ? '[svg]' : x.glif || '·'}  ${x.nama.padEnd(14)} ${x.ikon}`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
