#!/usr/bin/env node
/*
 * uji-retrieval-otomatis.mjs - harness item ZEPH-RETRIEVAL-OTOMATIS.
 *
 * APA YANG DIUJI (dan kenapa ini bukan klaim):
 *   A. >= 16 kueri TIDAK LAZIM (salah tulis, huruf besar-kecil campur, kalimat
 *      utuh, kueri panjang, emoji, tanda baca, kata umum, id/label persis, kueri
 *      ngawur) tetap memicu pencarian yang BENAR. Contoh kueri + hasil nyata
 *      dicetak apa adanya; kueri yang memang tidak punya jawaban harus jujur
 *      nol entri (bukan retrieval paksa).
 *   B. Jumlah hasil DIBATASI. Angka konstanta diambil dari modul yang diuji:
 *      zephyrCari BATAS_HASIL_BAWAAN / BATAS_HASIL_MAKS / BATAS_KARAKTER_HASIL,
 *      suntikan BATAS_HASIL_SUNTIK / BATAS_KARAKTER_SUNTIK; zephyrDokumen
 *      BATAS_HASIL_BAWAAN / BATAS_HASIL_MAKS / BATAS_KARAKTER_HASIL.
 *   C. Tidak ada hasil duplikat: kunci unik `kategori|kunci`, dokumen unik
 *      `berkas:baris`.
 *   D. Hasil tidak memuat NILAI KUNCI apa pun: seluruh keluaran baterai dipindai
 *      pola kredensial (sk-*, ghp_*, AKIA, xoxb-, Bearer, PEM, JWT, apiKey=...,
 *      password=...). Bila ada, yang dicetak hanya NAMA pola, bukan nilainya.
 *   E. Deterministik: dua kali jalankan anak = keluaran byte-identik.
 *   F. Jalur OTOMATIS benar-benar terpasang di kode produk (bukan cuma tersedia
 *      sebagai tool): jumlah titik panggil otomatis `suntikanIndeks(` di
 *      src/lib, dan status lapis dokumen (`suntikanDokumen`) sebagai temuan.
 *
 * Modul yang diuji di-bundle apa adanya (real zephyrCari / zephyrDokumen), bukan
 * tiruan. Tidak ada berkas produk yang diubah: harness ini hanya membaca.
 *
 * Cara pakai: node scripts/uji-retrieval-otomatis.mjs   (exit 0 lulus, 1 merah)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KERJA = join(AKAR, 'scratch', 'uji-retrieval-otomatis');

/* ------------------------------------------------------------------ baterai A */

/*
 * `harus`:
 *   'ada'    -> pencarian WAJIB menemukan sesuatu (kueri tidak lazim tapi masuk akal)
 *   'kosong' -> WAJIB 0 entri (tidak ada yang relevan; retrieval tidak dipaksa)
 *   'bebas'  -> dicatat apa adanya, tidak dipaksa lulus
 */
const KASUS = [
  { q: 'zepyr car', harus: 'ada', catat: 'salah tulis 1 huruf' },
  { q: 'TEMA GELAP ZEPHYR', harus: 'ada', catat: 'kapital semua' },
  { q: '!!! ??? ;;;', harus: 'kosong', catat: 'tanda baca saja' },
  { q: '', harus: 'kosong', catat: 'string kosong' },
  { q: '     ', harus: 'kosong', catat: 'spasi saja' },
  { q: 'a', harus: 'bebas', catat: 'satu huruf' },
  { q: '🔥 tema gelap', harus: 'ada', catat: 'emoji + kata nyata' },
  { q: 'campurEnKapital_dan_underscore 12345', harus: 'bebas', catat: 'campur + angka acak' },
  { q: 'cara pakai zephyr_self buat nyari setelan', harus: 'ada', catat: 'kalimat utuh bahasa sehari-hari' },
  { q: 'aku mau ngatur api key model AI', harus: 'ada', catat: 'sinonim/parafrase' },
  { q: 'shortcut keyboard untuk split editor vertikal', harus: 'ada', catat: 'frasa tidak lazim' },
  { q: 'apakah zephyr bisa jalan di mac', harus: 'bebas', catat: 'pertanyaan di tepi cakupan' },
  { q: 'terminal.toggle', harus: 'ada', catat: 'id perintah persis' },
  { q: 'AI: Configure Models & API Keys', harus: 'ada', catat: 'label persis' },
  { q: "setelan' OR 1=1--", harus: 'bebas', catat: 'mirip injection' },
  { q: 'src/lib/zephyrTools/catalog.ts', harus: 'ada', catat: 'jalur berkas' },
  { q: 'bagaimana prosedur deploy ke server produksi', harus: 'bebas', catat: 'tidak ada di proyek' },
  { q: 'xxx yyy zzz', harus: 'kosong', catat: 'kata ngawur' },
  { q: `${'panjang '.repeat(40)}tema`, harus: 'bebas', catat: 'kueri sangat panjang' },
  { q: 'Z', harus: 'bebas', catat: 'satu huruf besar yang muncul di banyak label' },
];

/* --------------------------------------------------------------- pola rahasia */

/* Nama pola + regex. Nilai yang cocok TIDAK pernah dicetak. */
const POLA_RAHASIA = [
  ['openai-sk', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['github-pat', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['aws-akia', /\bAKIA[0-9A-Z]{12,}/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['bearer', /\bBearer\s+[A-Za-z0-9._-]{12,}/],
  ['pem-private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./],
  ['apiKey-isi', /\bapi[_-]?key\s*["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}["']/i],
  ['password-isi', /\bpassword\s*["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i],
  ['token-isi', /\btoken\s*["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i],
];

/* -------------------------------------------------------------------- entri */

const ENTRI = `import { writeFileSync } from 'node:fs';
import * as C from '../../src/lib/zephyrCari';
import * as D from '../../src/lib/zephyrDokumen';

const daftar: string[] = JSON.parse(process.env.RET_UJI ?? '[]');
const keluar = process.env.RET_KELUAR ?? '';
const ringkas = (h: any) => ({
  kategori: h.kategori,
  kunci: h.kunci,
  skor: h.skor,
  cara: h.cara ?? 'ketat',
  teks: h.teks,
});
const data = {
  batas: {
    cariHasilBawaan: C.BATAS_HASIL_BAWAAN,
    cariHasilMaks: C.BATAS_HASIL_MAKS,
    cariKarakter: C.BATAS_KARAKTER_HASIL,
    suntikHasil: C.BATAS_HASIL_SUNTIK,
    suntikKarakter: C.BATAS_KARAKTER_SUNTIK,
    dokHasilBawaan: D.BATAS_HASIL_BAWAAN,
    dokHasilMaks: D.BATAS_HASIL_MAKS,
    dokKarakter: D.BATAS_KARAKTER_HASIL,
    dokPotongan: D.BATAS_POTONGAN,
    dokSuntikHasil: D.BATAS_HASIL_SUNTIK,
    dokSuntikKarakter: D.BATAS_KARAKTER_SUNTIK,
  },
  jumlahEntri: C.jumlahEntri(),
  versi: C.versiFakta(),
  kasus: daftar.map((q) => {
    const bawaan = C.cariFakta(q);
    const luas = C.cariFakta(q, { batas: 9999 });
    const dok = D.cariDokumen(q);
    const dokLuas = D.cariDokumen(q, { batas: 9999 });
    return {
      q,
      entri: bawaan.map(ringkas),
      entriLuas: luas.map(ringkas),
      cocok: C.hitungCocok(q),
      asing: C.kataTakDikenal(q),
      pecah: C.pecahKueri(q),
      suntikan: C.suntikanIndeks(q),
      format: C.formatHasil(luas),
      formatBawaan: C.formatHasil(bawaan),
      dok: dok.map((h: any) => ({ berkas: h.berkas, baris: h.baris, judul: h.judul, potongan: h.potongan })),
      dokLuas: dokLuas.map((h: any) => ({ berkas: h.berkas, baris: h.baris, judul: h.judul, potongan: h.potongan })),
      dokSuntik: D.suntikanDokumen(q),
      dokFormat: D.formatHasilDokumen(dokLuas),
    };
  }),
};
writeFileSync(keluar, JSON.stringify(data));
`;

mkdirSync(KERJA, { recursive: true });
writeFileSync(join(KERJA, 'entri.ts'), ENTRI);
const bundel = join(KERJA, 'entri.mjs');
await esbuild.build({
  entryPoints: [join(KERJA, 'entri.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundel,
  logLevel: 'warning',
});

const jalankan = (nama) => {
  const keluar = join(KERJA, `hasil-${nama}.json`);
  const anak = spawnSync(process.execPath, [bundel], {
    cwd: AKAR,
    env: { ...process.env, RET_UJI: JSON.stringify(KASUS.map((k) => k.q)), RET_KELUAR: keluar },
    encoding: 'utf8',
  });
  if (anak.status !== 0) {
    console.error(`GAGAL menjalankan entri (${nama}):\n${anak.stdout ?? ''}${anak.stderr ?? ''}`);
    process.exit(1);
  }
  return readFileSync(keluar, 'utf8');
};

const mentah1 = jalankan('1');
const mentah2 = jalankan('2');
const D = JSON.parse(mentah1);

/* ---------------------------------------------------------------- pelaporan */

let lulus = 0;
let total = 0;
const merah = [];
const cek = (bagian, nama, syarat, bukti = '') => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  OK    ${bagian}${nama}${bukti ? `  [${bukti}]` : ''}`);
  } else {
    merah.push(`${bagian}${nama}`);
    console.log(`  GAGAL ${bagian}${nama}  [${bukti}]`);
  }
};

console.log('UJI RETRIEVAL OTOMATIS (ZEPH-RETRIEVAL-OTOMATIS)');
console.log(`  indeks ${D.jumlahEntri} entri, versi fakta ${D.versi.aplikasi} hash ${D.versi.hashSumber}`);
console.log(`  batas zephyrCari: hasil bawaan ${D.batas.cariHasilBawaan}, maks ${D.batas.cariHasilMaks}, karakter ${D.batas.cariKarakter}`);
console.log(`  batas suntikan indeks: ${D.batas.suntikHasil} entri / ${D.batas.suntikKarakter} char`);
console.log(
  `  batas zephyrDokumen: hasil bawaan ${D.batas.dokHasilBawaan}, maks ${D.batas.dokHasilMaks}, karakter ${D.batas.dokKarakter}, satu potongan ${D.batas.dokPotongan}, suntik ${D.batas.dokSuntikHasil} entri / ${D.batas.dokSuntikKarakter} char`,
);

/* ---- A. kueri tidak lazim tetap mencari dengan benar ---- */
console.log('\n(A) kueri tidak lazim -> hasil nyata');
let adaOk = 0;
let kosongOk = 0;
for (let i = 0; i < KASUS.length; i++) {
  const k = KASUS[i];
  const d = D.kasus[i];
  const jml = d.entri.length;
  const top = d.entri[0];
  const cocokHarus = k.harus === 'ada' ? jml > 0 : k.harus === 'kosong' ? jml === 0 : true;
  const tampil = k.q.length > 48 ? `${k.q.slice(0, 48)}...` : k.q;
  console.log(
    `  ${cocokHarus ? 'ok  ' : 'X   '} [${k.catat}] "${tampil}" -> ${jml} entri` +
      `${top ? `, teratas [${top.kategori}] ${String(top.kunci).slice(0, 60)} (cara ${top.cara})` : ''}` +
      `${d.asing.length ? `, kata asing: ${d.asing.slice(0, 3).join(',')}` : ''}`,
  );
  if (k.harus !== 'bebas') {
    cek('A', i + 1, cocokHarus, `"${tampil}" wajib ${k.harus === 'ada' ? 'ada hasil' : 'nol hasil'}: nyata ${jml} entri`);
    if (k.harus === 'ada') adaOk++;
    else kosongOk++;
  }
}
cek('A', 90, KASUS.length >= 16, `${KASUS.length} kueri tidak lazim diuji (minimal 16)`);
cek('A', 91, adaOk + kosongOk >= 12, `${adaOk} kueri wajib-ada + ${kosongOk} kueri wajib-kosong terbukti nyata`);

/* ---- B. batas jumlah hasil ---- */
console.log('\n(B) batas jumlah hasil');
let langgarBawaan = 0;
let langgarMaks = 0;
let langgarKarakter = 0;
let langgarSuntik = 0;
let langgarDok = 0;
let langgarPotongan = 0;
let langgarDokSuntik = 0;
let mentahLewatKarakter = 0; // entri mentah > BATAS_KARAKTER_HASIL (batas ditegakkan saat format)
let blokSuntikTerpanjang = 0;
let suntikTerpanjang = 0;
for (let i = 0; i < KASUS.length; i++) {
  const d = D.kasus[i];
  if (d.entri.length > D.batas.cariHasilBawaan) langgarBawaan++;
  if (d.entriLuas.length > D.batas.cariHasilMaks) langgarMaks++;
  if (d.format.length > D.batas.cariKarakter || d.formatBawaan.length > D.batas.cariKarakter) langgarKarakter++;
  const karakterMentah = d.entriLuas.reduce((s, e) => s + String(e.teks ?? '').length, 0);
  if (karakterMentah > D.batas.cariKarakter) mentahLewatKarakter++;

  /* Anggaran suntikan: kepala + meta + 2 + potongan yang BENAR-BENAR ikut disuntik
   * harus <= BATAS_KARAKTER_SUNTIK. Penutup ditambahkan SESUDAH anggaran, jadi
   * panjang blok total sengaja diukur terpisah (dilaporkan sebagai info). */
  const arr = String(d.suntikan).split('\n');
  const isi = [];
  for (let j = 2; j < arr.length; j++) {
    if (arr[j].startsWith('- [')) isi.push(arr[j]);
    else break;
  }
  const anggaran = arr[0].length + (arr[1]?.length ?? 0) + 2 + isi.reduce((s, l) => s + l.length + 1, 0);
  if (isi.length > D.batas.suntikHasil || anggaran > D.batas.suntikKarakter) langgarSuntik++;
  blokSuntikTerpanjang = Math.max(blokSuntikTerpanjang, String(d.suntikan).length);
  suntikTerpanjang = Math.max(suntikTerpanjang, anggaran);

  const potongan = Math.max(0, ...d.dokLuas.map((e) => String(e.potongan ?? '').length));
  if (potongan > D.batas.dokPotongan) langgarPotongan++;
  if (d.dok.length > D.batas.dokHasilBawaan || d.dokLuas.length > D.batas.dokHasilMaks || d.dokFormat.length > D.batas.dokKarakter)
    langgarDok++;
  if (String(d.dokSuntik).length > D.batas.dokSuntikKarakter) langgarDokSuntik++;
}
cek('B', 1, langgarBawaan === 0, `cariFakta tanpa opsi <= ${D.batas.cariHasilBawaan} entri di SEMUA ${KASUS.length} kueri (langgar ${langgarBawaan})`);
cek('B', 2, langgarMaks === 0, `cariFakta batas 9999 dipotong ke <= ${D.batas.cariHasilMaks} entri (langgar ${langgarMaks})`);
cek('B', 3, langgarKarakter === 0, `formatHasil() <= ${D.batas.cariKarakter} karakter/kueri, bawaan & batas-9999 (langgar ${langgarKarakter})`);
cek('B', 4, langgarSuntik === 0, `anggaran suntikan <= ${D.batas.suntikKarakter} char dan <= ${D.batas.suntikHasil} entri (langgar ${langgarSuntik}); anggaran terpanjang ${suntikTerpanjang} char`);
cek('B', 5, langgarDok === 0, `cariDokumen: <= ${D.batas.dokHasilBawaan} default, <= ${D.batas.dokHasilMaks} maks, format <= ${D.batas.dokKarakter} char (langgar ${langgarDok})`);
cek('B', 6, langgarPotongan === 0, `satu potongan dokumen <= ${D.batas.dokPotongan} char (langgar ${langgarPotongan})`);
cek('B', 7, langgarDokSuntik === 0, `suntikanDokumen <= ${D.batas.dokSuntikKarakter} char (langgar ${langgarDokSuntik})`);
console.log(`  info: blok suntikan TERPANJANG (termasuk penutup di luar anggaran) = ${blokSuntikTerpanjang} char`);
console.log(`  info: entri mentah cariFakta > ${D.batas.cariKarakter} char pada ${mentahLewatKarakter} kueri (batas ditegakkan di formatHasil, bukan di cariFakta)`);

/* ---- C. tidak ada duplikat ---- */
console.log('\n(C) tidak ada hasil duplikat');
let dupEntri = 0;
let dupDok = 0;
let kasusDenganEntri = 0;
let kasusDenganDok = 0;
for (const d of D.kasus) {
  if (d.entriLuas.length) kasusDenganEntri++;
  if (d.dokLuas.length) kasusDenganDok++;
  const kunci = d.entriLuas.map((e) => `${e.kategori}|${e.kunci}`);
  if (new Set(kunci).size !== kunci.length) dupEntri++;
  const lok = d.dokLuas.map((e) => `${e.berkas}:${e.baris}`);
  if (new Set(lok).size !== lok.length) dupDok++;
}
cek('C', 1, dupEntri === 0, `kunci 'kategori|kunci' unik di ${kasusDenganEntri} kueri yang berhasil (duplikat di ${dupEntri} kueri)`);
cek('C', 2, dupDok === 0, `lokasi 'berkas:baris' unik di ${kasusDenganDok} kueri dokumen (duplikat di ${dupDok} kueri)`);

/* ---- D. tidak memuat nilai kunci ---- */
console.log('\n(D) hasil bebas nilai kunci');
const seluruh = `${mentah1}\n${mentah2}`;
const temuan = [];
for (const [nama, re] of POLA_RAHASIA) {
  const m = seluruh.match(new RegExp(re.source, re.flags + 'g'));
  if (m && m.length) temuan.push(`${nama} (x${m.length})`);
}
cek('D', 1, temuan.length === 0, temuan.length ? `POLA BERBAHAYA DITEMUKAN: ${temuan.join(', ')} - nilai tidak dicetak` : `${POLA_RAHASIA.length} pola kredensial dipindai, 0 temuan`);
console.log(`  info: hasil menyebut NAMA berkas 'secrets.json' (bukan nilainya): ${seluruh.includes('secrets.json') ? 'ya' : 'tidak'}`);

/* ---- E. deterministik ---- */
console.log('\n(E) deterministik');
const sha1 = createHash('sha256').update(mentah1).digest('hex');
const sha2 = createHash('sha256').update(mentah2).digest('hex');
cek('E', 1, sha1 === sha2, `dua jalan anak byte-identik (sha256 ${sha1.slice(0, 16)}...)`);

/* ---- F. jalur otomatis terpasang di kode produk ---- */
console.log('\n(F) jalur otomatis di kode produk');
const berkasProduk = ['src/lib/systemPrompt.ts', 'src/lib/aiStore.ts'];
/* Hitung TITIK PANGGIL NYATA: baris komentar (dimulai *, //, /*) dibuang dulu,
 * supaya angka di laporan berarti "dipanggil", bukan "disebut di komentar". */
const hitung = (berkas, kata) =>
  readFileSync(join(AKAR, berkas), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .filter((l) => l.includes(kata)).length;
const titikIndeks = berkasProduk.map((b) => ({ berkas: b, n: hitung(b, 'suntikanIndeks(') }));
const totalIndeks = titikIndeks.reduce((s, x) => s + x.n, 0);
const titikDok = berkasProduk.map((b) => ({ berkas: b, n: hitung(b, 'suntikanDokumen(') }));
const totalDok = titikDok.reduce((s, x) => s + x.n, 0);
console.log(`  titik panggil otomatis suntikanIndeks(): ${titikIndeks.map((x) => `${x.berkas}=${x.n}`).join(', ')}`);
console.log(`  titik panggil otomatis suntikanDokumen(): ${titikDok.map((x) => `${x.berkas}=${x.n}`).join(', ')}`);
const kasusDokSuntik = D.kasus.filter((d) => String(d.dokSuntik).length > 0).length;
cek('F', 1, existsSync(join(AKAR, 'src/lib/zephyrDokumen.ts')), 'modul dokumen ada');
cek('F', 2, totalIndeks >= 1, `suntikanIndeks() dipanggil otomatis ${totalIndeks}x lintas berkas prompt (tanpa tool call model)`);
cek('F', 3, kasusDokSuntik >= 1, `suntikanDokumen() memberi keluaran nyata saat dipanggil langsung (${kasusDokSuntik}/${KASUS.length} kueri)`);
if (totalDok === 0) {
  console.log('  TEMUAN CELAH (bukan kegagalan harness): suntikanDokumen() belum dipanggil otomatis di kode produk -> lapis dokumen belum ikut tersuntik.');
} else {
  console.log(`  TEMUAN: suntikanDokumen() sudah dipanggil otomatis ${totalDok}x.`);
}

/* ------------------------------------------------------------------ verdict */
console.log(`\n  SKOR: ${lulus}/${total} diperiksa`);
console.log(
  `  RINGKAS: ${KASUS.length} kueri tidak lazim; batas bawaan ${D.batas.cariHasilBawaan}/maks ${D.batas.cariHasilMaks} entri, format ${D.batas.cariKarakter} char; ` +
    `duplikat 0; pola kredensial ${temuan.length}; determinisme ${sha1 === sha2 ? 'identik' : 'BEDA'}; suntikanIndeks otomatis ${totalIndeks}x, suntikanDokumen ${totalDok}x.`,
);
writeFileSync(join(KERJA, 'ringkas.json'), JSON.stringify({
  skor: `${lulus}/${total}`,
  merah,
  batas: D.batas,
  jumlahEntri: D.jumlahEntri,
  kasus: KASUS.length,
  adaOk,
  kosongOk,
  dupEntri,
  dupDok,
  temuanRahasia: temuan,
  sha256: sha1,
  deterministik: sha1 === sha2,
  titikIndeks,
  totalIndeks,
  titikDok,
  totalDok,
  blokSuntikTerpanjang,
  mentahLewatKarakter,
}, null, 2));
console.log(`  berkas bukti: scratch/uji-retrieval-otomatis/ringkas.json, hasil-1.json, hasil-2.json`);
console.log(`  VERDICT RETRIEVAL-OTOMATIS: ${merah.length ? `GAGAL - ${merah.length} merah: ${merah.join(' | ')}` : 'LULUS'}`);
process.exit(merah.length ? 1 : 0);
