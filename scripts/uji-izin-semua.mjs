#!/usr/bin/env node
/**
 * scripts/uji-izin-semua.mjs — agregator harness IZIN/GUARD terminal
 * (item V4V12-IZIN-TERMINAL)
 *
 * Gunanya: satu perintah, satu jawaban -> "apakah lapisan izin terminal masih utuh?"
 *
 * ATURAN SKRIP INI
 *  - TIDAK memakai wildcard (`scripts/*.mjs`): daftar harness ditulis EKSPLISIT,
 *    supaya tidak ada skrip baru yang diam-diam ikut atau diam-diam bolong.
 *  - Tiga daftar terpisah supaya jujur:
 *      HARUS_HIJAU   : hijau = perilaku produk/izin benar. Merah -> exit 1.
 *      BUTUH_APP     : butuh app hidup (CDP 9223). App mati -> SKIP + exit 2.
 *      DIKENAL_MERAH : sudah dianalisis, akarnya tertulis di dokumen. BUKAN
 *                      kegagalan baru, tetapi kalau tiba-tiba HIJAU tetap
 *                      dilaporkan (tanda analisis/dokumen sudah basi).
 *    Ditambah klasifikasi otomatis: harness apa pun yang mati dengan penanda app
 *    (BUTUH APP / ECONNREFUSED / 127.0.0.1:9223) SELAGI app memang mati dipindah
 *    ke kategori BUTUH APP dan dicetak dengan alasan + exit aslinya. Lihat
 *    docs/LAPORAN-VONIS-IZIN.md.
 *  - Harness yang butuh aplikasi hidup (CDP 127.0.0.1:9223): kalau aplikasi
 *    mati -> SKIP (bukan GAGAL), exit 2, dengan pesan jelas.
 *    CATATAN: harness app-dependent juga bisa merah kalau aplikasi RELOAD di
 *    tengah uji (Vite HMR saat pekerja lain menyunting src/ — gejalanya
 *    "halaman sepertinya RELOAD di tengah uji"). Itu artefak lingkungan,
 *    bukan cacat produk: ulangi saat pohon repo tenang.
 *  - Skrip ini TIDAK mengubah berkas apa pun, TIDAK mengeksekusi perintah
 *    berbahaya; ia hanya menjalankan harness lain lalu merekap keluarannya.
 *
 * Pakai: node scripts/uji-izin-semua.mjs
 *        UJI_IZIN_SEMUA_VERBOSE=1 node scripts/uji-izin-semua.mjs
 */
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.env.UJI_IZIN_SEMUA_VERBOSE === '1';
const TIMEOUT_MS = 180000;

/**
 * Harness yang wajib hijau TANPA aplikasi (murni node).
 *
 * VONIS IZIN: `verify-tool-inti`, `uji-trim-tool`, dan `cek-aturan-operasional`
 * dulu ada di sini padahal ketiganya menempel ke CDP 127.0.0.1:9223
 * (`lib-cdp.mjs` Cdp.attach; `cek-aturan-operasional.mjs:22` fetch /json/list).
 * Saat app mati ketiganya MATI dengan ECONNREFUSED - itu "tidak bisa mengukur",
 * bukan "produk melanggar izin". Karena itu ketiganya pindah ke BUTUH_APP.
 */
const HARUS_HIJAU = [
  'cek-izin-terminal',
  'uji-guard-listener',
  'uji-aturan-tool',
  'uji-ssh-aman',
  'uji-ssh-rencana',
  'uji-jadwal-rencana',
  'cek-konteks-repo',
  'uji-konteks-repo-adv',
  'uji-aturan-proyek',
  'uji-fetch-web-rencana',
  'cek-subset-tugas',
  /*
   * Uji kesiapan katalog: murni node (bundle esbuild), tidak butuh app.
   * VONIS IZIN: ia dulu "dikenal merah" karena mengukur `alatUntukTugas`
   * (memang tanpa cap) lalu menuntut <= 20; kini mengukur jalur kirim nyata
   * (`pilihToolTugas`, aiStore.ts:5909) yang benar-benar menegakkan cap itu.
   */
  'uji-kesiapan-tool',
];

/**
 * Harness yang butuh aplikasi hidup (CDP 127.0.0.1:9223).
 * Saat app mati: SKIP dengan alasan terbaca - BUKAN MERAH.
 */
const BUTUH_APP = [
  'uji-batas-tulis',
  'verify-tool-inti',
  'uji-trim-tool',
  'cek-aturan-operasional',
  'verify-tool-gate',
];

/**
 * Sudah dianalisis: merah karena sebab yang sudah didokumentasikan - BUKAN
 * kegagalan baru; tetapi kalau tiba-tiba HIJAU tetap dilaporkan (tanda
 * analisis/dokumen sudah basi).
 *
 * KOSONG sejak vonis izin (docs/LAPORAN-VONIS-IZIN.md): dua entri lamanya
 * diperbaiki di akarnya, bukan dipindah ke keranjang "dikenal merah" -
 *   - verify-tool-gate  : membaca `m.TOOL_DEFAULT` yang tidak pernah ada di
 *                         src/lib/toolGate.ts; kini memakai `TOOL_AKTIF_AWAL`
 *                         (toolGate.ts:186) dan mengaku BUTUH APP (exit 2) kalau
 *                         :9223 mati -> pindah ke BUTUH_APP.
 *   - uji-kesiapan-tool : mengukur `alatUntukTugas` (tanpa cap) padahal cap <=20
 *                         ditegakkan `pilihToolTugas` (aiStore.ts:5909); kini
 *                         mengukur jalur kirim nyata -> HARUS_HIJAU.
 * Daftar ini DIPERTAHANKAN (mekanismenya masih dipakai) supaya merah yang
 * terdokumentasi tetap bisa dicatat tanpa menyamarkannya sebagai merah baru.
 */
const DIKENAL_MERAH = [];
function adaApp() {
  return new Promise((selesai) => {
    const s = net.connect({ host: '127.0.0.1', port: 9223 });
    const tutup = (hasil) => {
      try {
        s.destroy();
      } catch {
        /* abaikan */
      }
      selesai(hasil);
    };
    s.setTimeout(1200);
    s.once('connect', () => tutup(true));
    s.once('error', () => tutup(false));
    s.once('timeout', () => tutup(false));
  });
}

function jalankan(nama) {
  const r = spawnSync(process.execPath, [path.join('scripts', `${nama}.mjs`)], {
    cwd: AKAR,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const keluaran = `${r.stdout || ''}${r.stderr || ''}`;
  const baris = keluaran.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const kode = r.status === null ? -1 : r.status;
  return { nama, kode, baris, keluaran, kehabisanWaktu: r.status === null };
}

/**
 * Penanda "harness ini butuh app". Dipakai HANYA ketika app memang mati, supaya
 * kegagalan menghubungi CDP tidak menyamar sebagai pelanggaran produk. Harness
 * yang butuh app tetapi gagal karena sebab LAIN (app hidup) tetap MERAH - jadi
 * ini tidak melunakkan apa pun.
 */
const PENANDA_BUTUH_APP = /BUTUH APP|ECONNREFUSED|tidak bisa dihubungi|127\.0\.0\.1:9223/i;

const appHidup = await adaApp();
const hasil = [];

for (const nama of HARUS_HIJAU) hasil.push({ ...jalankan(nama), jenis: 'HARUS_HIJAU' });
for (const nama of BUTUH_APP) {
  if (!appHidup) {
    hasil.push({ nama, jenis: 'BUTUH_APP', kode: null, baris: ['SKIP: aplikasi tidak hidup di 127.0.0.1:9223'], keluaran: '' });
    continue;
  }
  hasil.push({ ...jalankan(nama), jenis: 'BUTUH_APP' });
}
for (const d of DIKENAL_MERAH) hasil.push({ ...jalankan(d.nama), jenis: 'DIKENAL_MERAH', dikenal: d });

/*
 * Klasifikasi ulang: harness yang TIDAK terdaftar sebagai BUTUH_APP tetapi mati
 * karena app mati. Buktinya harus terbaca di keluaran (BUTUH APP / ECONNREFUSED /
 * 127.0.0.1:9223 / "tidak bisa dihubungi") DAN app memang mati - kalau app hidup,
 * kegagalan tetap MERAH. Alasan + exit aslinya dicetak apa adanya.
 */
let dipindahKeButuhApp = 0;
for (const h of hasil) {
  if (h.kode === null || h.kode === 0) continue;
  if (h.jenis === 'BUTUH_APP') continue;
  if (appHidup || !PENANDA_BUTUH_APP.test(h.keluaran)) continue;
  h.exitAsli = h.kode;
  h.kode = null;
  h.jenis = 'BUTUH_APP';
  h.baris = [`SKIP: harness ini butuh app - 127.0.0.1:9223 mati (dikenali dari keluarannya, exit asli ${h.exitAsli})`];
  dipindahKeButuhApp += 1;
}

const lebar = Math.max(...hasil.map((h) => h.nama.length));
const label = (h) => {
  if (h.kode === null) return 'SKIP';
  return h.kode === 0 ? 'OK  ' : 'MERAH';
};

console.log('== uji-izin-semua ==');
console.log(`akar repo     : ${AKAR}`);
console.log(`aplikasi (9223): ${appHidup ? 'HIDUP' : 'MATI'}`);
console.log(`harness        : ${HARUS_HIJAU.length} wajib hijau + ${BUTUH_APP.length} butuh app + ${DIKENAL_MERAH.length} dikenal merah`);
console.log('');

let gagalBaru = 0;
let skip = 0;
let regresiDikenal = 0;

for (const h of hasil) {
  console.log(`  ${label(h)}  ${h.nama.padEnd(lebar)}  exit=${h.kode === null ? '-' : h.kode}  ${h.baris.length ? h.baris[h.baris.length - 1].slice(0, 96) : '(tanpa keluaran)'}`);
  if (h.jenis === 'HARUS_HIJAU' && h.kode !== 0) gagalBaru += 1;
  if (h.jenis === 'BUTUH_APP' && h.kode === null) skip += 1;
  if (h.jenis === 'BUTUH_APP' && h.kode !== 0 && h.kode !== null) {
    gagalBaru += 1;
    console.log('        catatan: harness ini butuh aplikasi hidup — kalau app reload di tengah uji (HMR saat pekerja lain menyunting src/), ulangi saat pohon repo tenang.');
  }
  if (h.jenis === 'DIKENAL_MERAH') {
    if (h.kode === 0) regresiDikenal += 1;
    console.log(`        akar   : ${h.dikenal.akar} — ${h.dikenal.kenapa}`);
    console.log(`        dokumen: ${h.dikenal.dok}`);
  }
}

if (VERBOSE) {
  console.log('');
  console.log('-- keluaran mentah --');
  for (const h of hasil) {
    console.log('');
    console.log(`### ${h.nama} (exit=${h.kode === null ? '-' : h.kode})`);
    console.log(h.keluaran.trimEnd() || '(kosong)');
  }
}

console.log('');
console.log('== Ringkasan ==');
console.log(`harness wajib hijau yang merah : ${gagalBaru}`);
console.log(`butuh app tapi di-SKIP         : ${skip}${dipindahKeButuhApp ? ` (dari klasifikasi otomatis: ${dipindahKeButuhApp})` : ''}`);
console.log(`dikenal-merah yang jadi hijau  : ${regresiDikenal}${regresiDikenal ? ' -> dokumennya sudah basi, perbarui' : ''}`);
console.log(`total harness dijalankan       : ${hasil.length}`);

if (gagalBaru > 0) {
  console.log('HASIL: BELUM LOLOS (exit 1) — ada harness izin yang merah; lihat keluaran di atas.');
  process.exit(1);
}
if (skip > 0) {
  console.log('HASIL: SEBAGIAN TIDAK DIUJI (exit 2) — aplikasi Zephyr mati, jadi harness CDP di-SKIP. Hidupkan aplikasi lalu ulangi.');
  process.exit(2);
}
if (regresiDikenal > 0) {
  console.log('HASIL: LOLOS untuk lapisan izin, TAPI ada harness "dikenal merah" yang kini hijau (exit 1) — perbarui dokumennya.');
  process.exit(1);
}
console.log('HASIL: LULUS (exit 0) — semua harness izin yang wajib hijau memang hijau.');
process.exit(0);
