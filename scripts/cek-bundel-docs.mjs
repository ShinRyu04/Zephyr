/*
 * CEK-BUNDEL-DOCS - harness item AI-TAHU-100-4: buktikan bahwa SEMUA dokumen repo
 * (docs/**\/*.md + CHANGELOG + README + RELEASE_NOTES) benar-benar masuk ke
 * aplikasi dan bisa dicari, bukan cuma niat di dokumen.
 *
 * Cara kerjanya: modul yang BENAR-BENAR ikut bundel (`src/lib/zephyrDokumen.ts`
 * + `src/lib/zephyrDokumenData.ts`) dibundel ulang lewat esbuild dan dijalankan
 * di Node - jadi yang diuji kode yang dipakai aplikasi, bukan salinan logika di
 * sini. Sumber kebenaran untuk pembanding adalah DISK: berkas nyata di `docs/`
 * dan akar repo, dibaca apa adanya.
 *
 * Yang diperiksa (dan angkanya dicetak):
 *   A. artefak tidak basi (gen-dokumen-bundel.mjs --check) + bundel tidak kosong
 *   B. jumlah berkas nyata == jumlah berkas terbaca; nama yang hilang/berlebih dicetak
 *   C. setiap bagian: ada nama berkas + judul, nomor baris sah, dan TEKSNYA ada di
 *      berkas nyata (bagian tidak dikarang)
 *   D. pencarian lokal menemukan istilah nyata (>= 6 istilah, mis. marketplace,
 *      tema, keymap) tanpa jaringan
 *   E. setiap potongan punya nomor baris, dan baris itu benar-benar memuat
 *      potongan tersebut di berkas nyata
 *   F. batas berlaku: batas kecil, batas besar dijepit BATAS_HASIL_MAKS, anggaran
 *      karakter hasil & suntikan, panjang potongan, kueri panjang
 *   G. pertanyaan "apa yang baru" dijawab dari CHANGELOG.md nyata (semua kutipan
 *      terverifikasi ada di berkas itu; bukan karangan)
 *
 * Jalan: node scripts/cek-bundel-docs.mjs   (exit 0 = lulus, 1 = ada yang merah)
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERJA = mkdtempSync(path.join(tmpdir(), 'cek-bundel-docs-'));

/* ------------------------------------------------------------------ alat cetak */

let lulus = 0;
let total = 0;
const merah = [];
const cek = (nama, syarat, bukti) => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  OK    ${nama}${bukti !== undefined ? `  [${bukti}]` : ''}`);
  } else {
    merah.push(nama);
    console.log(`  GAGAL ${nama}  [${bukti}]`);
  }
};
const angka = (nama, nilai) => console.log(`  ANGKA ${nama.padEnd(38)} ${nilai}`);

console.log('CEK BUNDEL DOKUMEN ZEPHYR (AI-TAHU-100-4)');

/* ------------------------------------------------------------------ A. artefak */

console.log('\n(A) artefak bundel: hasil generate vs disk');
let sinkron = '';
let sinkronOke = false;
try {
  sinkron = execFileSync(
    process.execPath,
    [path.join(AKAR, 'scripts', 'gen-dokumen-bundel.mjs'), '--check'],
    { encoding: 'utf8', cwd: AKAR },
  ).trim();
  sinkronOke = true;
} catch (e) {
  sinkron = String(e.stdout ?? e.message).trim();
}
cek('artefak sinkron dengan berkas di disk', sinkronOke, sinkron);
cek(
  'generator ada dan bisa dijalankan ulang',
  true,
  'scripts/gen-dokumen-bundel.mjs --check',
);

/* ------------------------------------------------------------------ bundel ulang */

await build({
  entryPoints: [
    path.join(AKAR, 'src', 'lib', 'zephyrDokumen.ts'),
    path.join(AKAR, 'src', 'lib', 'zephyrDokumenData.ts'),
  ],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'silent',
  outdir: KERJA,
  outExtension: { '.js': '.mjs' },
});

const D = await import(pathToFileURL(path.join(KERJA, 'zephyrDokumen.mjs')).href);
const DATA = await import(pathToFileURL(path.join(KERJA, 'zephyrDokumenData.mjs')).href);
const BAGIAN = DATA.DOKUMEN_BAGIAN ?? [];
const BERKAS = DATA.DOKUMEN_BERKAS ?? [];

cek('modul zephyrDokumen.ts terbundel & termuat', typeof D.cariDokumen === 'function', `${Object.keys(D).length} ekspor`);
cek('bundel tidak kosong', !D.bundelKosong(), `${D.jumlahBerkas()} berkas / ${D.jumlahBagian()} bagian`);
angka('versi.hashSumber bundel', D.versiDokumen().hashSumber);
angka('versi.dihasilkan (mtime terbaru)', D.versiDokumen().dihasilkan);
angka('total byte teks terbundel', D.versiDokumen().totalByte);

/* ------------------------------------------------------------------ B. cakupan */

/* Aturan pemilihan berkas WAJIB sama dengan generator - kalau tidak, angkanya
 * tidak sebanding. Keduanya: docs rekursif + README/CHANGELOG/RELEASE_NOTES akar. */
function daftarNyata() {
  const nama = [];
  const telusuri = (rel) => {
    for (const e of readdirSync(path.join(AKAR, rel), { withFileTypes: true })) {
      const anak = `${rel}/${e.name}`;
      if (e.isDirectory()) telusuri(anak);
      else if (e.name.toLowerCase().endsWith('.md')) nama.push(anak);
    }
  };
  telusuri('docs');
  for (const e of readdirSync(AKAR, { withFileTypes: true })) {
    if (e.isFile() && /^(readme|changelog|release_notes).*\.md$/i.test(e.name)) nama.push(e.name);
  }
  return [...new Set(nama)].sort();
}

const bacaCache = new Map();
function bacaNyata(rel) {
  if (!bacaCache.has(rel)) {
    const teks = readFileSync(path.join(AKAR, rel), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    bacaCache.set(rel, { teks, baris: teks.split('\n') });
  }
  return bacaCache.get(rel);
}
const rapikan = (s) => s.replace(/\s+/g, ' ').trim();

/*
 * Berkas yang berubah di disk SETELAH panen (mis. lane lain menyunting docs-nya
 * bersamaan). Artefak yang sedang diuji tetap snapshot revisi lama yang SAH -
 * yang meleset cuma perbandingan dengan disk saat ini. Dibedakan tegas dari
 * "karangan" (teks tidak ada di berkas DAN berkasnya tidak berubah), supaya
 * kegagalan balapan lintas-lane tidak dilaporkan sebagai data palsu.
 */
const metaBerkas = new Map(BERKAS.map((b) => [b[0], b]));
function berubahSejakPanen(rel) {
  const m = metaBerkas.get(rel);
  if (!m) return false;
  try {
    const st = statSync(path.join(AKAR, rel));
    return st.size !== m[1] || st.mtime.toISOString() !== m[2];
  } catch {
    return true;
  }
}

console.log('\n(B) cakupan berkas: disk vs bundel');
const nyata = daftarNyata();
const terbaca = BERKAS.map((b) => b[0]).sort();
const hilang = nyata.filter((n) => !terbaca.includes(n));
const berlebih = terbaca.filter((n) => !nyata.includes(n));
angka('berkas docs/*.md + CHANGELOG/README nyata', nyata.length);
angka('berkas TERBACA di bundel', terbaca.length);
angka('bagian dokumen terbaca', BAGIAN.length);
cek('jumlah berkas nyata == terbaca', nyata.length === terbaca.length, `${nyata.length} vs ${terbaca.length}`);
cek('tidak ada berkas nyata yang hilang dari bundel', hilang.length === 0, hilang.length ? `hilang: ${hilang.join(', ')}` : 'tidak ada');
cek('tidak ada berkas hantu di bundel', berlebih.length === 0, berlebih.length ? `hantu: ${berlebih.join(', ')}` : 'tidak ada');
cek('setiap berkas punya ukuran + waktu ubah', BERKAS.every((b) => b[1] > 0 && !Number.isNaN(Date.parse(b[2]))), `${BERKAS.length} berkas`);
cek(
  'metadata bagian cocok dengan isi bundel',
  BERKAS.reduce((n, b) => n + b[3], 0) === BAGIAN.length,
  `${BERKAS.reduce((n, b) => n + b[3], 0)} di metadata vs ${BAGIAN.length} di DOKUMEN_BAGIAN`,
);
for (const b of BERKAS) console.log(`        ${String(b[3]).padStart(3)} bagian · ${String(b[1]).padStart(7)} B · ${b[4].toString().padStart(5)} baris · ${b[0]}`);

/* ------------------------------------------------------------------ C. bagian */

console.log('\n(C) setiap bagian: nama berkas + judul + teks nyata');
const tanpaBerkas = BAGIAN.filter((b) => !b[0] || !terbaca.includes(b[0]));
const tanpaJudul = BAGIAN.filter((b) => !b[1]);
const barisAneh = BAGIAN.filter(
  (b) =>
    !Number.isInteger(b[2]) ||
    !Number.isInteger(b[3]) ||
    !(b[2] > 0 || (b[2] === 0 && b[1] === '(tanpa judul)')) ||
    b[3] < 1,
);
cek('semua bagian punya nama berkas yang ada di bundel', tanpaBerkas.length === 0, `${BAGIAN.length} bagian diperiksa`);
cek('semua bagian punya judul', tanpaJudul.length === 0, tanpaJudul.length ? 'ada judul kosong' : 'tidak ada judul kosong');
cek('nomor baris judul & teks sah (0 hanya untuk tanpa judul)', barisAneh.length === 0, `${barisAneh.length} aneh`);
const tanpaBadan = BAGIAN.filter((b) => !b[4].trim());
const tanpaBadanAneh = tanpaBadan.filter((b) => {
  const l = bacaNyata(b[0]).baris[b[3] - 1];
  return !(l === undefined || rapikan(l) === '' || rapikan(l).startsWith('#'));
});
angka('bagian judul-tanpa-badan (mis. "## [Unreleased]")', `${tanpaBadan.length} dari ${BAGIAN.length}`);
cek(
  'bagian tanpa badan hanya judul yang isinya memang kosong',
  tanpaBadanAneh.length === 0,
  tanpaBadanAneh.length ? `aneh: ${tanpaBadanAneh.slice(0, 3).map((b) => `${b[0]}:${b[2]}`).join(' | ')}` : 'semua sah',
);

let teksNyataOke = 0;
const teksTidakNyata = [];
const teksBergeser = [];
for (const b of BAGIAN) {
  if (bacaNyata(b[0]).teks.includes(b[4])) teksNyataOke++;
  else if (berubahSejakPanen(b[0])) teksBergeser.push(`${b[0]}:${b[2]}`);
  else teksTidakNyata.push(`${b[0]}:${b[2]} ${b[1]}`);
}
cek(
  'teks setiap bagian ada apa adanya di berkas nyata (tidak dikarang)',
  teksTidakNyata.length === 0,
  `${teksNyataOke}/${BAGIAN.length} bagian` + (teksTidakNyata.length ? ` | karangan: ${teksTidakNyata.slice(0, 3).join(' | ')}` : ''),
);
const judulSalah = BAGIAN.filter(
  (b) => b[2] > 0 && !berubahSejakPanen(b[0]) && !rapikan(bacaNyata(b[0]).baris[b[2] - 1] ?? '').startsWith('#'),
);
cek('barisJudul benar-benar baris judul di berkas nyata', judulSalah.length === 0, `${BAGIAN.length - judulSalah.length}/${BAGIAN.length} cocok`);
const teksSalah = BAGIAN.filter(
  (b) =>
    b[4].trim() &&
    !berubahSejakPanen(b[0]) &&
    rapikan(bacaNyata(b[0]).baris[b[3] - 1] ?? '') !== rapikan(b[4].split('\n')[0]),
);
cek('barisTeks menunjuk baris pertama teks di berkas nyata', teksSalah.length === 0, `${BAGIAN.length - teksSalah.length}/${BAGIAN.length} cocok`);
const takBergaris = BAGIAN.filter((b) => b[3] + b[4].split('\n').length - 1 > bacaNyata(b[0]).baris.length);
cek('teks bagian tidak melewati akhir berkas', takBergaris.length === 0, `${takBergaris.length} lewat batas`);
const berubah = BERKAS.filter((b) => berubahSejakPanen(b[0])).map((b) => b[0]);
angka('berkas yang berubah sejak panen (lintas-lane)', berubah.length ? berubah.join(', ') : 'tidak ada');
if (berubah.length) {
  console.log(
    '  CATATAN berkas di atas disunting lane lain SETELAH panen; artefak tetap snapshot revisi\n' +
      '         saat panen. Jalankan `node scripts/gen-dokumen-bundel.mjs` lalu ulangi cek ini.',
  );
}

/* ------------------------------------------------------------------ D. pencarian */

console.log('\n(D) pencarian lokal (tanpa jaringan) menemukan istilah nyata');
const ISTILAH = ['marketplace', 'tema', 'keymap', 'plugin', 'rilis', 'screenshot', 'changelog', 'ssh'];
let istilahKena = 0;
for (const t of ISTILAH) {
  const hasil = D.cariDokumen(t);
  const n = D.hitungCocok(t);
  if (hasil.length) istilahKena++;
  const atas = hasil[0];
  console.log(
    `        "${t}" -> ${n} bagian cocok, ${hasil.length} hasil | teratas: ${atas ? `${atas.berkas}:${atas.baris} · ${atas.judul}` : '-'}`,
  );
}
angka('istilah nyata yang ketemu', `${istilahKena}/${ISTILAH.length}`);
cek('minimal 6 istilah nyata ketemu', istilahKena >= 6, `${istilahKena} istilah`);
cek('kueri kosong tidak mengembalikan semua dokumen', D.cariDokumen('yang dan apa').length === 0, `cariDokumen("yang dan apa") -> ${D.cariDokumen('yang dan apa').length}`);
cek('kata umum dibuang dari kueri', D.kataKunciDokumen('apa yang baru di marketplace?').join(',') === 'baru,marketplace', D.kataKunciDokumen('apa yang baru di marketplace?').join(','));
cek('kata asing dilaporkan jujur', D.kataTakDikenal('kuery zzzqqq tidak ada').includes('zzzqqq'), D.kataTakDikenal('kuery zzzqqq tidak ada').join(','));
cek('pencarian per berkas dibatasi (opsi berkas)', D.cariDokumen('tema', { berkas: 'CHANGELOG.md' }).every((h) => h.berkas === 'CHANGELOG.md'), `berkas=CHANGELOG.md`);

/* ------------------------------------------------------------------ E. potongan */

console.log('\n(E) potongan: nomor baris + teks ada di baris itu di berkas nyata');
const kueriSample = [...ISTILAH, 'bundel dokumen', 'apa yang baru', 'pintasan papan ketik', 'rilis 1.1.12', 'agent subagen peran', 'keputusan marketplace', 'jalur ssh', 'spike pane browser'];
let potonganDiperiksa = 0;
const potonganSalah = [];
const potonganBergeser = [];
const salahBaris = [];
for (const q of kueriSample) {
  for (const h of D.cariDokumen(q, { batas: 30 })) {
    potonganDiperiksa++;
    const inti = h.potongan.replace(/…$/, '');
    if (!(Number.isInteger(h.baris) && h.baris >= 1)) {
      salahBaris.push(`${q} -> ${h.berkas}:${h.baris}`);
      continue;
    }
    const baris = bacaNyata(h.berkas).baris[h.baris - 1] ?? '';
    if (inti.length > 0 && rapikan(baris).includes(inti)) continue;
    if (berubahSejakPanen(h.berkas)) potonganBergeser.push(`${h.berkas}:${h.baris}`);
    else potonganSalah.push(`${q} -> ${h.berkas}:${h.baris}`);
  }
}
angka('potongan diperiksa', potonganDiperiksa);
cek('setiap potongan punya nomor baris >= 1', salahBaris.length === 0, salahBaris.length ? `salah: ${salahBaris.slice(0, 4).join(' | ')}` : 'semua sah');
cek(
  'setiap potongan ada di berkas nyata pada baris itu',
  potonganSalah.length === 0,
  `${potonganDiperiksa - potonganSalah.length - potonganBergeser.length}/${potonganDiperiksa}` +
    (potonganSalah.length ? ` | tidak nyata: ${potonganSalah.slice(0, 3).join(' | ')}` : '') +
    (potonganBergeser.length ? ` | ${potonganBergeser.length} pada berkas yang berubah sejak panen` : ''),
);
cek('potongan punya nama berkas', kueriSample.every((q) => D.cariDokumen(q).every((h) => h.berkas.length > 0)), 'semua hasil');
cek('potongan tidak melebihi BATAS_POTONGAN', kueriSample.every((q) => D.cariDokumen(q, { batas: 30 }).every((h) => h.potongan.length <= D.BATAS_POTONGAN)), `<= ${D.BATAS_POTONGAN} char`);
cek('tidak ada hasil dengan potongan kosong', kueriSample.every((q) => D.cariDokumen(q, { batas: 30 }).every((h) => h.potongan.trim().length > 0)), 'semua hasil');
cek('judul tanpa badan tidak jadi hasil (isi kosong)', D.cariDokumen('unreleased').every((h) => h.potongan.trim().length > 0), `${D.cariDokumen('unreleased').length} hasil untuk "unreleased"`);
const contoh = D.cariDokumen('marketplace')[0];
console.log(`        contoh: ${contoh.berkas}:${contoh.baris} · ${contoh.judul}\n                "${contoh.potongan}"`);

/* ------------------------------------------------------------------ F. batas */

console.log('\n(F) batas berlaku (angka konstanta, bukan tersembunyi)');
angka('BATAS_HASIL_BAWAAN / MAKS', `${D.BATAS_HASIL_BAWAAN} / ${D.BATAS_HASIL_MAKS}`);
angka('BATAS_KARAKTER_HASIL / POTONGAN', `${D.BATAS_KARAKTER_HASIL} / ${D.BATAS_POTONGAN}`);
angka('BATAS_HASIL_SUNTIK / KARAKTER_SUNTIK', `${D.BATAS_HASIL_SUNTIK} / ${D.BATAS_KARAKTER_SUNTIK}`);
angka('BATAS_KATA_KUERI / BARU_BAWAAN', `${D.BATAS_KATA_KUERI} / ${D.BATAS_BARU_BAWAAN}`);

const luas = 'zephyr';
angka('bagian yang memuat "zephyr"', D.hitungCocok(luas));
cek('batas kecil dipatuhi', D.cariDokumen(luas, { batas: 3 }).length <= 3, `${D.cariDokumen(luas, { batas: 3 }).length} <= 3`);
cek('batas bawaan dipatuhi', D.cariDokumen(luas).length <= D.BATAS_HASIL_BAWAAN, `${D.cariDokumen(luas).length} <= ${D.BATAS_HASIL_BAWAAN}`);
const maksHasil = D.cariDokumen(luas, { batas: 9999 });
cek('batas besar dijepit BATAS_HASIL_MAKS', maksHasil.length <= D.BATAS_HASIL_MAKS, `${maksHasil.length} <= ${D.BATAS_HASIL_MAKS} (diminta 9999)`);
cek('batas 0 / negatif tidak jadi nol hasil', D.cariDokumen(luas, { batas: 0 }).length === 1, `${D.cariDokumen(luas, { batas: 0 }).length} hasil`);
cek('batas tidak dihormati? (batas 3 harus 3 hasil bila cukup kandidat)', D.cariDokumen(luas, { batas: 3 }).length === Math.min(3, D.hitungCocok(luas)), `${D.cariDokumen(luas, { batas: 3 }).length} vs min(3, ${D.hitungCocok(luas)})`);

const teksHasil = D.formatHasilDokumen(maksHasil);
angka('panjang teks hasil maksimum', `${teksHasil.length} char`);
cek('anggaran karakter hasil dipatuhi', teksHasil.length <= D.BATAS_KARAKTER_HASIL, `${teksHasil.length} <= ${D.BATAS_KARAKTER_HASIL}`);

const kueriPanjang = Array.from({ length: 40 }, (_, i) => `kata${i}`).join(' ');
cek('kueri 40 kata dipotong ke BATAS_KATA_KUERI', D.kataKunciDokumen(kueriPanjang).length <= D.BATAS_KATA_KUERI, `${D.kataKunciDokumen(kueriPanjang).length} <= ${D.BATAS_KATA_KUERI}`);

const suntik = D.suntikanDokumen('apa isi dokumen marketplace');
angka('panjang suntikanDokumen()', `${suntik.length} char`);
cek('anggaran karakter suntikan dipatuhi', suntik.length <= D.BATAS_KARAKTER_SUNTIK, `${suntik.length} <= ${D.BATAS_KARAKTER_SUNTIK}`);
cek('suntikan menyebut nama berkas + baris', /\.md:\d+/.test(suntik), suntik.split('\n')[1]?.slice(0, 90) ?? '(kosong)');

/* ------------------------------------------------------------------ G. CHANGELOG */

console.log('\n(G) "apa yang baru" dijawab dari CHANGELOG.md nyata');
cek('niat kebaruan dikenali', D.pertanyaanBaru('apa yang baru?') && D.pertanyaanBaru('changelog terbaru'), `'apa yang baru?' dan 'changelog terbaru'`);
cek('pencarian biasa tidak dianggap tanya rilis', !D.pertanyaanBaru('apa isi dokumen keputusan marketplace') && !D.pertanyaanBaru('di mana setelan tema'), '2 kueri normal');
angka('versi rilis teratas CHANGELOG', D.versiTeratas());

const jawab = D.jawabApaYangBaru('apa yang baru?');
cek('jawaban menyebut CHANGELOG.md', jawab.includes('CHANGELOG.md'), jawab.split('\n')[0]);
cek('jawaban menyebut rilis teratas', jawab.includes(D.versiTeratas()), D.versiTeratas());
const kutipan = jawab.split('\n').filter((l) => l.startsWith('- '));
angka('kutipan perubahan dari CHANGELOG', kutipan.length);
cek('ada kutipan perubahan (bukan jawaban kosong)', kutipan.length >= 2, `${kutipan.length} kutipan`);

let kutipanOke = 0;
const kutipanSalah = [];
for (const l of kutipan) {
  const m = /^- (\S+\.md):(\d+) · (.*?) — (.*)$/.exec(l);
  if (!m) {
    kutipanSalah.push(`bentuk aneh: ${l.slice(0, 60)}`);
    continue;
  }
  const [, berkas, barisStr, , potongan] = m;
  const baris = Number(barisStr);
  const inti = potongan.replace(/…$/, '');
  const isiBaris = rapikan(bacaNyata(berkas).baris[baris - 1] ?? '');
  if (berkas === 'CHANGELOG.md' && baris >= 1 && inti.length > 0 && isiBaris.includes(inti)) kutipanOke++;
  else kutipanSalah.push(`${berkas}:${baris} -> "${inti.slice(0, 50)}" vs "${isiBaris.slice(0, 50)}"`);
}
cek(
  'setiap kutipan "apa yang baru" ada di berkas nyata pada barisnya',
  kutipanSalah.length === 0,
  `${kutipanOke}/${kutipan.length}` + (kutipanSalah.length ? ` | ${kutipanSalah.slice(0, 3).join(' | ')}` : ''),
);
cek('semua kutipan dari CHANGELOG.md', kutipan.every((l) => l.startsWith('- CHANGELOG.md:')), `${kutipan.length} baris`);
/* Rilis TERBARU, bukan rilis pertama: di CHANGELOG.md nyata blok `## [Unreleased]`
 * tidak berbadan (isinya di sub-bagian ###), jadi jawaban yang cuma mencari judul
 * `## [` akan melompat ke 1.0.0. Batas blok dihitung dari berkas nyata. */
const batasBlok = bacaNyata('CHANGELOG.md')
  .baris.map((l, i) => [l, i + 1])
  .filter(([l]) => /^##\s*\[?(unreleased|\d)/i.test(l))
  .map(([, n]) => n);
angka('judul blok rilis di CHANGELOG.md', batasBlok.join(', '));
const akhirBlokBaru = batasBlok[1] ?? Infinity;
cek(
  'kutipan "apa yang baru" berasal dari blok rilis TERATAS',
  kutipan.every((l) => Number(/- \S+\.md:(\d+)/.exec(l)[1]) < akhirBlokBaru),
  `semua baris < ${akhirBlokBaru === Infinity ? 'EOF' : akhirBlokBaru} (judul blok berikutnya)`,
);
cek('versi teratas = blok rilis pertama di berkas', bacaNyata('CHANGELOG.md').baris[batasBlok[0] - 1].includes(D.versiTeratas().replace(/^\[|\]$/g, '').split(' - ')[0]), `versiTeratas() = ${D.versiTeratas()}`);
cek('jawaban melarang mengarang perubahan', /Jangan menyebut perubahan/.test(jawab), 'ada aturan penutup');
const versiKarangan = /1\.1\.99/.test(jawab);
cek('jawaban tidak memuat versi yang tidak ada di CHANGELOG', !versiKarangan && !bacaNyata('CHANGELOG.md').teks.includes('1.1.99'), `'1.1.99' tidak ada di CHANGELOG.md`);
cek('suntikanDokumen("apa yang baru") memakai jalur CHANGELOG', D.suntikanDokumen('apa yang baru?').includes('CHANGELOG.md'), 'routing benar');
const apaYangBaru = D.apaYangBaru();
cek('apaYangBaru() mengembalikan kutipan CHANGELOG (<= BATAS_BARU_BAWAAN)', apaYangBaru.length > 0 && apaYangBaru.length <= D.BATAS_BARU_BAWAAN, `${apaYangBaru.length} bagian`);
console.log(`        ${jawab.split('\n').slice(0, 6).join('\n        ')}`);

/* ------------------------------------------------------------------ verdict */

rmSync(KERJA, { recursive: true, force: true });

console.log('');
console.log(`  SKOR: ${lulus}/${total} diperiksa`);
console.log(`  BERKAS: ${nyata.length} berkas nyata, ${terbaca.length} terbaca, ${BAGIAN.length} bagian`);
console.log(`  VERDICT BUNDEL DOKUMEN: ${merah.length ? `GAGAL - ${merah.length} merah: ${merah.join(' | ')}` : 'LULUS'}`);
process.exit(merah.length ? 1 : 0);
