// cek-subset-tugas.mjs - harness LAMA-a1: bukti bahwa subset tool PER KELAS TUGAS
// (src/lib/subsetTugas.ts) tidak pernah menembus batas 20 tool dan tidak pernah
// MENGHILANGKAN kemampuan.
//
// Cara kerja:
//   1. Bundel modul murni TS (subsetTugas, subsetAlat, catalog) jadi satu CJS di
//      node_modules/.cache/zephyr-harness/ lalu di-require. Tidak perlu app hidup:
//      modulnya murni, tanpa Tauri/React.
//   2. Untuk setiap kasus: hitung "sebelum" (yang dikirim app hari ini lewat
//      subsetAlat.alatUntukTugas) dan "sesudah" (subsetTugas.pilihToolTugas).
//   3. LULUS hanya bila: jumlah <= 20, tool inti lengkap, keluarga kemampuan
//      sesudah = SUPERSET keluarga sebelum (tidak ada kemampuan unik yang hilang),
//      setiap tool yang DIPANGKAS masih punya rumah keluarga di daftar baru, dan
//      nama tool yang di-ROUTE prompt (catalog.ts:516 "buka URL -> browser_open",
//      "baca halaman -> browser_read/web_fetch") tetap ikut saat kelas tugasnya
//      butuh web - nama yang disebut prompt tapi tidak dikirim tidak bisa
//      dipanggil tanpa tool_search lebih dulu.
//
// Pakai:  node scripts/cek-subset-tugas.mjs [--rinci]
// Gagal (exit != 0) bila ada satu kasus pun menembus 20 atau kehilangan kemampuan.
//
// Catatan arah superset (diukur, bukan diasumsikan): yang berlaku adalah
//   keluarga(sebelum)  SUBSET  keluarga(sesudah)      -> "kemampuan tidak berkurang"
// sedangkan superset menurut NAMA tool TIDAK berlaku di semua kasus: `pilihToolTugas`
// sengaja MEMPERTAHANKAN permukaan tulis (`write_file` dll) untuk tugas kelas baca
// yang teksnya ambigu, dan menambahkan tool web saat detektor kelas melihat kata
// panel/web. Arah penyimpangannya selalu PENAMBAHAN tool yang jalur lama tidak
// kirim - tidak pernah pengurangan yang tidak terjangkau. Kolom `nama⊇` di bawah
// melaporkan hal itu apa adanya, sedangkan `yatim` (dipangkas tanpa rumah keluarga)
// menjadi pemeriksaan GAGAL.

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(AKAR, 'node_modules', '.cache', 'zephyr-harness');
const require = createRequire(path.join(AKAR, 'package.json'));
const RINCI = process.argv.includes('--rinci');

/** Bundel modul murni lalu muat. */
async function muatUji() {
  const esbuild = require('esbuild');
  fs.mkdirSync(CACHE, { recursive: true });
  const keluar = path.join(CACHE, 'cek-subset.cjs');
  await esbuild.build({
    stdin: {
      contents:
        `export * as subsetTugas from './src/lib/subsetTugas';\n` +
        `export * as subsetAlat from './src/lib/subsetAlat';\n` +
        `export * as catalog from './src/lib/zephyrTools/catalog';\n`,
      resolveDir: AKAR,
      loader: 'ts',
      sourcefile: 'cek-subset-entry.ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: keluar,
    absWorkingDir: AKAR,
    logLevel: 'silent',
  });
  return require(keluar);
}

const uji = await muatUji();
const T = uji.subsetTugas;
const A = uji.subsetAlat;
const C = uji.catalog;

/* Basis ukur audit (docs/AUDIT-KATALOG-TOOL.md): 26 tool "dikirim selalu".
   Inilah yang benar-benar dikirim app per giliran; angka audit 17/23/23/20/23/23
   diukur pada basis ini - karena itu "sebelum" di harness memakai basis yang sama. */
const AKTIF = [...new Set([...C.TOOL_DIKIRIM_SELALU])];
/* Basis kedua (informasional): 62 tool aktif-default, yaitu gate user dibuka lebar. */
const AKTIF_PENUH = [...new Set([...C.TOOL_BAWAAN_AKTIF, ...C.TOOL_WEB_AKTIF_AWAL])];

const KASUS = [
  ['baca', 'Baca src/lib/aiStore.ts, ringkas fungsi penyimpanan pesan'],
  ['perbaiki+uji', 'Perbaiki bug di src/lib/zephyrTools/builtins.ts lalu jalankan test-nya'],
  ['tulis-banyak', 'Tulis 20 komponen React baru untuk halaman admin di src/components/admin'],
  ['web', 'Cari harga tiket pesawat ke Bali di web, lalu buka halaman hasilnya'],
  ['repo-wide+hapus', 'Rapikan repo: ganti nama folder, hapus berkas build, jalankan build ulang'],
  ['repo-wide+tulis', 'Rekam regresi di seluruh repo lalu tulis ringkasannya ke docs/laporan.md'],
  /* 6 tambahan: kelas lain + bentuk ringan/ambigu. */
  ['tanya(ambigu)', 'lanjut'],
  ['uji+shell', 'Jalankan npm test di terminal lalu laporkan hasilnya'],
  ['git', 'Commit perubahan ini ke branch feat/ai-panel dan tunjukkan diff-nya'],
  ['jadwal', 'Buat jadwal pengingat tiap jam untuk cek status build'],
  ['memori', 'Ingat preferensi saya: selalu pakai pnpm, jangan npm'],
  ['panel', 'Buka panel preview lalu ambil screenshot halaman itu'],
  /* 1 regresi: teks tugas ASLI `scripts/uji-kurs-dollar.mjs`, ditemukan 2026-10-15.
     Kunci kalimatnya: "sumber yang kamu bisa baca" + "baca" lain membuat
     `rumahPanel()` menjatuhkan pilihan pada `browser_read` untuk keluarga
     `panel-kendali`. `browser_read` sudah terkirim dari giliran `baca-panel`
     (keluarganya `baca-panel`), jadi `tambah()` diam kembali, `tertutup` tak
     pernah mencatat `panel-kendali`, dan `browser_open` - nama yang justru
     DISEBUT prompt (systemPrompt.ts:651 "panggil browser_open") - gugur dari
     daftar kirim. Akibatnya run asli membakar 9 langkah `tool_search` cuma
     buat menemukan tool yang harusnya sudah ada. Kasus lama tidak pernah
     memicunya karena tidak ada teks yang mengandung kata "baca" sambil butuh
     pane. Kalau kasus ini GAGAL lagi, penyebabnya ada di `rumahPanel()` /
     filter rumah `jejakPemilihan`. */
  [
    'kurs+pane(regresi)',
    [
      'Pakai browser pane di dalam aplikasi ini (tool browser_open / browser_read / browser_nav) untuk mencari di Google:',
      'kurs 1 dollar Amerika ke rupiah hari ini.',
      '',
      'ATURAN PANE - penting: pakai SATU pane browser saja. Jangan buka pane browser baru setiap kali membuka halaman;',
      'navigasi halaman berikutnya di pane yang sudah ada (browser_open akan memakai ulang pane yang ada, atau browser_nav goto).',
      'Pane baru hanya kalau saya minta membandingkan dua halaman berdampingan.',
      '',
      'Setelah kurs hari ini ketemu, susun daftar kurs 1 USD ke IDR per tahun dari 1998 sampai 2026',
      '(pakai sumber yang kamu bisa baca: Google, Bank Indonesia, atau data kurs historis).',
      '',
      'Simpan hasilnya di berkas `kurs-dollar.md` di workspace ini: tabel dengan kolom Tahun | Kurs 1 USD (IDR) | Sumber,',
      'lalu satu paragraf singkat sumber datanya. Kalau ada tahun yang datanya tidak kamu temukan, tulis "tidak ditemukan" di baris itu -',
      'jangan mengarang angka.',
    ].join('\n'),
  ],
];

/*
 * Nama tool yang di-ROUTE prompt (catalog.ts:516): prompt menyebut nama-nama ini
 * supaya model memanggilnya langsung. Kalau kelas tugasnya butuh web tapi nama itu
 * dipangkas, model harus `tool_search` dulu - persis lubang yang aturan routing itu
 * ada untuk menutup. Karena itu pelanggarannya GAGAL, bukan sekadar kolom info.
 */
const RUTE_WEB = ['web_search', 'web_fetch', 'browser_open', 'browser_read'];

let gagal = 0;
const baris = [];
for (const [nama, tugas] of KASUS) {
  const sebelum = A.alatUntukTugas(tugas, AKTIF, true);
  const sebelumPenuh = A.alatUntukTugas(tugas, AKTIF_PENUH, true);
  const jejak = T.jejakPemilihan(tugas, AKTIF, true);
  const sesudah = jejak.dikirim;
  const hilang = T.keluargaHilang(sebelum, sesudah);
  const intiHilang = T.TOOL_INTI_TUGAS.filter((n) => !sesudah.includes(n));
  /*
   * Superset per NAMA (bukan per keluarga): apa yang jalur lama kirim tapi jalur
   * baru tidak, dan sebaliknya. `yatim` = nama yang dipangkas TANPA satu pun
   * keluarganya tersisa di daftar baru - itu kehilangan kemampuan sesungguhnya,
   * dan berbeda dari sekadar "tool kembarnya yang dikirim".
   */
  const keluargaSesudah = new Set(T.keluargaDaftar(sesudah));
  const dipangkasNama = sebelum.filter((n) => !sesudah.includes(n));
  const yatim = dipangkasNama.filter(
    (n) => !T.keluargaTool(n).some((k) => keluargaSesudah.has(k)),
  );
  const intiDipangkas = dipangkasNama.filter((n) => T.TOOL_INTI_TUGAS.includes(n));
  const tambahanNama = sesudah.filter((n) => !sebelum.includes(n));
  const kelasWeb = jejak.kelas.includes('web');
  const ruteHilang = !kelasWeb
    ? []
    : RUTE_WEB.filter((n) => sebelum.includes(n) && !sesudah.includes(n));
  const masalah = [];
  if (sesudah.length > T.BATAS_TOOL_TUGAS) masalah.push(`MENEMBUS ${T.BATAS_TOOL_TUGAS} (${sesudah.length})`);
  if (intiHilang.length) masalah.push(`inti hilang: ${intiHilang.join(', ')}`);
  if (hilang.length) masalah.push(`kemampuan hilang: ${hilang.join(', ')}`);
  if (yatim.length) masalah.push(`dipangkas tanpa rumah: ${yatim.join(', ')}`);
  if (intiDipangkas.length) masalah.push(`tool inti dipangkas tanpa kembar: ${intiDipangkas.join(', ')}`);
  if (ruteHilang.length) masalah.push(`nama di-route prompt dipangkas saat kelas web: ${ruteHilang.join(', ')}`);
  if (!sesudah.every((n) => AKTIF.includes(n))) masalah.push('ada tool di luar daftar aktif');
  if (sesudah.some((n) => !AKTIF_PENUH.includes(n))) masalah.push('ada tool di luar daftar aktif penuh (62)');
  /* jalur penemuan tool wajib ada supaya yang dipangkas tetap terjangkau */
  if (!sesudah.includes('tool_search') || !sesudah.includes('tool_call'))
    masalah.push('jalur tool_search/tool_call tidak ada');
  /* determinisme */
  const ulang = T.pilihToolTugas(tugas, AKTIF, true).join(',');
  if (ulang !== sesudah.join(',')) masalah.push('tidak deterministik');

  const status = masalah.length ? `GAGAL (${masalah.join('; ')})` : 'LULUS';
  if (masalah.length) gagal++;
  baris.push({
    nama,
    tugas,
    kelas: jejak.kelas.join('+'),
    sebelum: sebelum.length,
    sebelumPenuh: sebelumPenuh.length,
    sesudah: sesudah.length,
    diLuarBasisPenuh: sesudah.filter((n) => !AKTIF_PENUH.includes(n)),
    dipangkas: jejak.dipangkas.length,
    hilang,
    dipangkasNama,
    yatim,
    intiDipangkas,
    ruteHilang,
    tambahanNama,
    namaSuperset: tambahanNama.length === 0,
    daftarSebelum: sebelum,
    status,
    daftar: sesudah,
    keluarga: jejak.keluargaDikirim,
    tanpaRumah: jejak.keluargaTanpaRumah,
    alasanContoh: jejak.dipangkas.slice(0, 3).map((d) => `${d.nama}: ${d.alasan}`),
  });
}

/* Pemeriksaan tambahan: modul bekerja di luar kasus di atas. */
const cek = [];
const a1 = T.pilihToolTugas('', AKTIF, true);
if (a1.length === 0) cek.push('tugas kosong menghasilkan daftar kosong');
if (a1.length > T.BATAS_TOOL_TUGAS) cek.push('tugas kosong menembus batas');
const tanpaFolder = T.pilihToolTugas('Baca berkas ini', AKTIF, false);
if (tanpaFolder.some((n) => T.BUTUH_FOLDER_TUGAS.includes(n)))
  cek.push('tool butuh folder ikut terkirim saat tidak ada folder');
if (T.BATAS_TOOL_TUGAS !== 20) cek.push(`BATAS_TOOL_TUGAS = ${T.BATAS_TOOL_TUGAS}, harus 20`);
if (T.TOOL_INTI_TUGAS.length < 8) cek.push('daftar tool inti terlalu pendek');
for (const wajib of ['read_file', 'write_file', 'grep', 'glob', 'bash_run', 'todo_write', 'tool_search', 'tool_call'])
  if (!T.TOOL_INTI_TUGAS.includes(wajib)) cek.push(`tool inti wajib tidak ada: ${wajib}`);
/* Hasil pemangkasan berbasis data run nyata (153 langkah, 10 nama 0 pemakaian)
   harus TETAP terpangkas - jangan dikembalikan diam-diam. */
const DIPANGKAS_DATA = ['edit', 'delete_file', 'move_file', 'copy_file', 'list_directory', 'think', 'ask_user'];
for (const n of DIPANGKAS_DATA)
  if (AKTIF.includes(n)) cek.push(`tool 0-pemakaian sudah dikembalikan ke TOOL_DIKIRIM_SELALU: ${n}`);
/* Kembar tidak boleh dikirim bertiga/berdua sekaligus. */
const kembar = [
  ['ganti-teks-berkas', ['edit', 'multi_edit', 'replace_in_files']],
  ['delegasi-agen', ['run_subagent', 'run_subagents']],
];
for (const [nama, grup] of kembar) {
  for (const k of KASUS) {
    const daftar = T.pilihToolTugas(k[1], AKTIF, true);
    const ikut = grup.filter((n) => daftar.includes(n));
    if (ikut.length > 1) cek.push(`${k[0]}: ${nama} dikirim ${ikut.length}x (${ikut.join(', ')})`);
  }
}
if (cek.length) gagal += cek.length;

/* ---------------- laporan ---------------- */
console.log('== HARNESS SUBSET TOOL PER TUGAS (LAMA-a1) ==');
console.log(`katalog=${C.TOOL_CATALOG.length} tool, aktif-default=${AKTIF.length}, batas per giliran=${T.BATAS_TOOL_TUGAS}`);
console.log(`ambang ukur audit: 17/23/23/20/23/23 -> 4 dari 6 menembus 20\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('kelas tugas', 26) +
    pad('lama', 6) +
    pad('kirim', 6) +
    pad('<=20', 6) +
    pad('nama_superset', 14) +
    pad('pangkas', 8) +
    pad('tambah', 7) +
    'status',
);
for (const b of baris) {
  console.log(
    pad(`${b.nama} [${b.kelas}]`, 26) +
      pad(b.sebelum, 6) +
      pad(b.sesudah, 6) +
      pad(b.sesudah <= 20 ? 'ya' : 'TIDAK', 6) +
      pad(b.namaSuperset ? 'ya' : 'tidak (tambah)', 14) +
      pad(b.dipangkasNama.length, 8) +
      pad(b.tambahanNama.length, 7) +
      b.status,
  );
}
if (RINCI) {
  console.log('\n-- rincian --');
  for (const b of baris) {
    console.log(`\n* ${b.nama}: "${b.tugas}"`);
    console.log(`  kelas: ${b.kelas}`);
    console.log(`  lama (${b.daftarSebelum.length}): ${b.daftarSebelum.join(', ')}`);
    console.log(`  kirim (${b.daftar.length}): ${b.daftar.join(', ')}`);
    console.log(
      `  nama dipangkas (${b.dipangkasNama.length}${b.dipangkasNama.length ? ': ' + b.dipangkasNama.join(', ') : ''}) ` +
        `| dipangkas tanpa rumah: ${b.yatim.length ? b.yatim.join(', ') : 'tidak ada'}`,
    );
    console.log(
      `  nama ditambah (${b.tambahanNama.length}${b.tambahanNama.length ? ': ' + b.tambahanNama.join(', ') : ''})`,
    );
    if (b.ruteHilang.length)
      console.log(`  !! nama di-ROUTE prompt dipangkas: ${b.ruteHilang.join(', ')}`);
    console.log(`  keluarga (${b.keluarga.length}): ${b.keluarga.join(', ')}`);
    if (b.tanpaRumah.length) console.log(`  keluarga tanpa rumah: ${b.tanpaRumah.join(', ')}`);
    for (const a of b.alasanContoh) console.log(`  - ${a}`);
  }
}
if (cek.length) {
  console.log('\n-- pemeriksaan modul --');
  for (const c of cek) console.log(`  GAGAL: ${c}`);
}
const maks = Math.max(...baris.map((b) => b.sesudah));
const namaSupersetYa = baris.filter((b) => b.namaSuperset).length;
const yatimTotal = baris.reduce((n, b) => n + b.yatim.length, 0);
const intiPangkasTotal = baris.reduce((n, b) => n + b.intiDipangkas.length, 0);
const tambahTotal = baris.reduce((n, b) => n + b.tambahanNama.length, 0);
const ruteTotal = baris.reduce((n, b) => n + b.ruteHilang.length, 0);
console.log(`\nMAKS tool per giliran sesudah pemangkasan: ${maks} (target <= ${T.BATAS_TOOL_TUGAS})`);
console.log(`kemampuan hilang di semua kasus: ${baris.reduce((n, b) => n + b.hilang.length, 0)}`);
console.log(`dipangkas TANPA rumah keluarga (semua kasus): ${yatimTotal} | tool inti dipangkas: ${intiPangkasTotal}`);
console.log(
  `superset per NAMA (lama ⊇ kirim): ${namaSupersetYa}/${baris.length} kasus; ` +
    `${baris.length - namaSupersetYa} kasus lain hanya MENAMBAH ${tambahTotal} tool yang jalur lama tidak kirim ` +
    '(arahnya perluasan, bukan kehilangan - kolom nama_superset di atas)',
);
console.log(
  `nama di-ROUTE prompt (${RUTE_WEB.join('/')}) hilang saat kelas web: ${ruteTotal} ` +
    (ruteTotal ? '<-- GAGAL: prompt menyebut nama itu, model tidak bisa memanggilnya tanpa tool_search' : ''),
);
console.log(gagal === 0 ? 'HASIL: LULUS - semua kasus <= 20 tool dan superset kemampuan' : `HASIL: GAGAL (${gagal} masalah)`);
process.exit(gagal === 0 ? 0 : 1);
