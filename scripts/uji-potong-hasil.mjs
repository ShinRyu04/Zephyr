/**
 * uji-potong-hasil.mjs - bukti pemotongan hasil tool menyisakan KEPALA dan EKOR.
 *
 * Kenapa ini penting: pemotongan kepala-saja membuang kesimpulan setiap
 * keluaran berbentuk log. `cargo test` menaruh `error:` dan baris `N failed`
 * di BAWAH; `npm run build` menaruh galat bundler di bawah; jejak tumpukan
 * runtime seluruhnya di bawah. Model yang hanya menerima 500 karakter pertama
 * melihat spanduk kompilasi dan gema perintah - bagian yang tidak pernah
 * mengatakan apa yang gagal - lalu menyimpulkan dari daftar yang kehilangan
 * kesimpulannya.
 *
 * Yang diuji:
 *   1. keluaran pendek TIDAK disentuh sama sekali
 *   2. keluaran panjang menyimpan ekornya, jadi kesimpulan log masih ada
 *   3. yang dibuang adalah bagian TENGAH, dan jumlahnya dilaporkan jujur
 *   4. hasilnya benar-benar lebih pendek (pemotongan masih menghemat)
 *   5. batas dihormati dengan toleransi catatan penanda
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan, tidak butuh network.
 *
 *   node scripts/uji-potong-hasil.mjs
 */
import { reporter } from './lib-cdp.mjs';

const R = reporter('pemotongan hasil tool (kepala + ekor)');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/*
 * Cerminan dari `potongHasilRiwayat` di `aiStore.ts` dan `potong` di
 * `zephyrTools/builtins.ts`. Keduanya memakai aturan yang sama - kepala 60%,
 * ekor 40% - jadi satu implementasi acuan di sini menguji keduanya. Kalau
 * salah satu berkas mengubah rasionya tanpa mengubah yang lain, uji ini tetap
 * lulus untuk aturan lama; karena itu ada pemeriksaan silang terhadap berkas
 * sumbernya di bagian akhir.
 */
const RASIO_EKOR = 0.4;

function potongAcuan(teks, batas) {
  if (teks.length <= batas) return teks;
  const ekor = Math.floor(batas * RASIO_EKOR);
  const kepala = batas - ekor;
  const hilang = teks.length - kepala - ekor;
  return `${teks.slice(0, kepala)}\n[... ${hilang} ...]\n${teks.slice(teks.length - ekor)}`;
}

/* ── 1. Keluaran pendek tidak disentuh ─────────────────────────────────── */

const pendek = 'exit=0 (12 ms)\n--- stdout ---\nOK';
R.check('P1', potongAcuan(pendek, 500) === pendek, 'keluaran pendek dikembalikan apa adanya');

/*
 * Tepat di batas juga tidak boleh disentuh: memotong keluaran yang sudah pas
 * hanya menambah catatan tanpa menghemat apa pun.
 */
const pas = 'x'.repeat(500);
R.check('P2', potongAcuan(pas, 500) === pas, 'keluaran tepat sepanjang batas tidak disentuh');

/* ── 2. Ekor bertahan - ini inti perbaikannya ──────────────────────────── */

/*
 * Tiruan log `cargo test` yang gagal: ribuan baris "test ... ok" di atas,
 * kesimpulan di bawah. Ini bentuk yang dulu kehilangan diagnosisnya.
 */
const logGagal =
  '   Compiling zephyr v1.1.13\n' +
  'warning: unused variable: `x`\n'.repeat(120) +
  'test result: FAILED. 388 passed; 3 failed; 0 ignored\n' +
  'error: test failed, to rerun pass `--lib`';

const hasil = potongAcuan(logGagal, 500);
R.check(
  'P3',
  hasil.includes('test result: FAILED'),
  'baris kesimpulan (`test result: FAILED`) SELAMAT setelah dipotong',
);
R.check(
  'P4',
  hasil.includes('error: test failed'),
  'baris error TERAKHIR selamat - inilah yang hilang pada versi kepala-saja',
);
R.check(
  'P5',
  hasil.includes('Compiling zephyr'),
  'kepala tetap ada, jadi asal-usul keluaran masih terbaca',
);

/* ── 3. Yang dibuang adalah TENGAH, dan dilaporkan jujur ───────────────── */

const tengah =
  'KEPALA-PENANDA\n' + 'T'.repeat(5000) + '\nEKOR-PENANDA';
const h3 = potongAcuan(tengah, 500);
/*
 * Yang diperiksa adalah PANJANG RUN, bukan ada-tidaknya huruf T.
 *
 * Kepala (300 karakter) memang memuat sebagian isi tengah - itu memang
 * tujuannya. Yang harus hilang adalah run PANJANG: 5.000 huruf T berubah jadi
 * paling banyak sepanjang jatah kepalanya. Assertion yang mencari "ada 200
 * huruf T" akan gagal padahal kodenya benar, karena kepala memang menyimpan
 * ~285 di antaranya.
 */
const runTerpanjang = (Math.max(0, ...(h3.match(/T+/g) || ['']).map((s) => s.length)));
R.check(
  'P6',
  runTerpanjang <= 300,
  `run tengah terpotong (terpanjang ${runTerpanjang} dari 5.000)`,
);
R.check('P7', h3.includes('KEPALA-PENANDA') && h3.includes('EKOR-PENANDA'), 'kedua ujung bertahan');
R.check('P8', /\d+/.test(h3), 'jumlah karakter yang hilang dilaporkan sebagai angka');

/*
 * Angka yang dilaporkan harus BENAR, bukan sekadar ada. Model memakai angka ini
 * untuk memutuskan apakah perlu membaca ulang; angka yang salah membuatnya
 * salah menilai berapa banyak yang belum dilihatnya.
 */
const hilangDilaporkan = Number((/\.\.\. (\d+) \.\.\./.exec(h3) || [])[1]);
const hilangSeharusnya = tengah.length - 500;
R.check(
  'P9',
  hilangDilaporkan === hilangSeharusnya,
  `jumlah yang dilaporkan tepat (${hilangDilaporkan} vs ${hilangSeharusnya})`,
);

/* ── 4. Pemotongan masih menghemat ─────────────────────────────────────── */

const raksasa = 'A'.repeat(200_000);
const h4 = potongAcuan(raksasa, 500);
R.check(
  'P10',
  h4.length < 1000,
  `hasil dipotong tetap kecil (${h4.length} karakter dari 200.000) - penghematannya nyata`,
);

/* ── 5. Batas dihormati (dengan toleransi catatan) ─────────────────────── */

R.check(
  'P11',
  h4.length <= 500 + 120,
  `tidak melebihi batas ditambah catatan (${h4.length} <= 620)`,
);

/* ── 6. Pemeriksaan silang ke berkas sumber ────────────────────────────── */

/*
 * Uji di atas menguji SALINAN aturannya. Bagian ini memastikan berkas aslinya
 * benar-benar memakai aturan yang sama, supaya salinan ini tidak perlahan
 * berbeda dari yang dipakai aplikasi.
 */
const fs = await import('node:fs');
const baca = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

const aiStore = baca('src/lib/aiStore.ts');
const builtins = baca('src/lib/zephyrTools/builtins.ts');

R.check(
  'P12',
  /export function potongHasilRiwayat/.test(aiStore),
  '`potongHasilRiwayat` ada di aiStore.ts',
);
R.check(
  'P13',
  /HISTORY_TOOL_TAIL_RATIO = 0\.4/.test(aiStore),
  'aiStore memakai rasio ekor 0.4',
);
R.check(
  'P14',
  /POTONG_EKOR_RASIO = 0\.4/.test(builtins),
  'builtins memakai rasio ekor 0.4',
);

/*
 * Yang paling menentukan: riwayat tool tidak boleh kembali memakai potongan
 * kepala-saja. Pola lama itu `isi.slice(0, HISTORY_TOOL_CHARS)` diikuti catatan
 * "result truncated" - kalau muncul lagi, perbaikan ini hilang.
 */
R.check(
  'P15',
  !/content:\s*\n?\s*isi\.length > HISTORY_TOOL_CHARS/.test(aiStore),
  'riwayat tool tidak kembali ke potongan kepala-saja',
);

console.log(
  `\n  rasio ekor: ${RASIO_EKOR}  (kepala ${(1 - RASIO_EKOR) * 100}%, ekor ${RASIO_EKOR * 100}%)`,
);
R.selesai();
process.exit(gagal ? 1 : 0);
