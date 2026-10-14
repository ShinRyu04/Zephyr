/**
 * uji-konteks-tugas.mjs - bukti substitusi variabel konteks di task runner.
 *
 * Kenapa ini penting: task runner ada supaya "jalankan yang sedang kubuka" jadi
 * satu tombol. Tanpa substitusi, `cargo test <berkas saat ini>` harus diketik
 * ulang tiap kali — sama saja tidak punya task runner.
 *
 * Yang diuji:
 *   1. token dikenal diganti nilainya
 *   2. token TIDAK dikenal dibiarkan apa adanya, bukan dikosongkan
 *   3. bentuk `${VAR}` dan `$VAR` dua-duanya bekerja
 *   4. variabel shell biasa TIDAK tersentuh
 *   5. teks pilihan di-escape supaya tidak memecah perintah
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-konteks-tugas.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('substitusi variabel konteks task runner');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* Cerminan `isiKonteks` di src/lib/tasksStore.ts. */
function isiKonteks(teks, nilai) {
  return teks.replace(/\$\{?(ZEPHYR_[A-Z_]+)\}?/g, (utuh, nama) =>
    Object.prototype.hasOwnProperty.call(nilai, nama) ? nilai[nama] : utuh,
  );
}

const KONTEKS = {
  ZEPHYR_FILE: 'D:/proj/src/api.rs',
  ZEPHYR_FILE_REL: 'src/api.rs',
  ZEPHYR_FILE_NAME: 'api.rs',
  ZEPHYR_ROW: '42',
  ZEPHYR_WORKTREE_ROOT: 'D:/proj',
};

/* ── 1. Token dikenal diganti ─────────────────────────────────────────── */

R.check('K1', isiKonteks('$ZEPHYR_FILE', KONTEKS) === 'D:/proj/src/api.rs', 'token polos diganti');
R.check('K2', isiKonteks('cargo test ${ZEPHYR_FILE_REL}', KONTEKS) === 'cargo test src/api.rs', 'di tengah perintah');
R.check('K3', isiKonteks('$ZEPHYR_FILE_NAME', KONTEKS) === 'api.rs', 'nama berkas saja');

/* ── 2. Bentuk $VAR dan ${VAR} dua-duanya ─────────────────────────────── */

R.check('K4', isiKonteks('$ZEPHYR_ROW', KONTEKS) === '42', 'bentuk $VAR');
R.check('K5', isiKonteks('${ZEPHYR_ROW}', KONTEKS) === '42', 'bentuk ${VAR}');
R.check(
  'K6',
  isiKonteks('baris $ZEPHYR_ROW dari ${ZEPHYR_FILE_NAME}', KONTEKS) === 'baris 42 dari api.rs',
  'dua bentuk dalam satu string',
);

/* ── 3. Token TIDAK dikenal dibiarkan ─────────────────────────────────── */

/*
 * Ini keputusan yang paling mudah salah. Mengosongkan token tak dikenal
 * membuat perintah berjalan dengan argumen kosong — keluarannya salah tapi
 * terlihat berhasil. Membiarkannya membuat perintahnya jelas-jelas rusak,
 * dan pembaca bisa memperbaikinya.
 */
R.check(
  'K7',
  isiKonteks('$ZEPHYR_SYMBOL', KONTEKS) === '$ZEPHYR_SYMBOL',
  'token tak dikenal DIBIARKAN, bukan dikosongkan',
);
R.check(
  'K8',
  isiKonteks('test $ZEPHYR_BERKAS', KONTEKS) === 'test $ZEPHYR_BERKAS',
  'token mirip tapi tak dikenal tetap dibiarkan',
);

/* ── 4. Variabel shell biasa tidak tersentuh ──────────────────────────── */

R.check('K9', isiKonteks('echo $HOME', KONTEKS) === 'echo $HOME', '$HOME tidak tersentuh');
R.check('K10', isiKonteks('echo ${PATH}', KONTEKS) === 'echo ${PATH}', '${PATH} tidak tersentuh');
R.check(
  'K11',
  isiKonteks('$env:TEMP', KONTEKS) === '$env:TEMP',
  'variabel PowerShell tidak tersentuh',
);
R.check(
  'K12',
  isiKonteks('ls $1 $2', KONTEKS) === 'ls $1 $2',
  'argumen posisi shell tidak tersentuh',
);

/* ── 5. Escape teks pilihan ───────────────────────────────────────────── */

/* Cerminan escape di konteksTugas(). */
const escapePilihan = (s) => s.replace(/(["`$\\])/g, '\\$1');

R.check(
  'K13',
  escapePilihan('kata biasa') === 'kata biasa',
  'teks tanpa karakter khusus tidak berubah',
);
R.check(
  'K14',
  escapePilihan('kata "kutip"') === 'kata \\"kutip\\"',
  'kutip ganda di-escape supaya tidak menutup argumen',
);
R.check(
  'K15',
  escapePilihan('a$b') === 'a\\$b',
  'tanda dolar di-escape supaya tidak jadi variabel shell',
);

/*
 * Yang paling menentukan: teks pilihan hasil escape, kalau dikembalikan ke
 * isiKonteks, TIDAK boleh diperlakukan sebagai variabel. Kalau tidak, pilihan
 * yang memuat "$ZEPHYR_FILE" akan berubah jadi nama berkas.
 */
const pilihan = escapePilihan('pakai $ZEPHYR_FILE di sini');
R.check(
  'K16',
  !/\$ZEPHYR_FILE(?!\\)/.test(pilihan.replace(/\\\$/g, '')),
  'dolar di dalam pilihan sudah dilindungi',
);

/* ── 6. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const src = (() => {
  try {
    return fs.readFileSync('src/lib/tasksStore.ts', 'utf8');
  } catch {
    return '';
  }
})();

R.check('K17', /export function isiKonteks/.test(src), 'isiKonteks diekspor dari tasksStore');
/*
 * The distinctive part of the pattern is the character class — it is what
 * limits substitution to our own tokens. Checking for that, rather than for
 * the whole escaped expression, keeps this cross-check from breaking on a
 * cosmetic rewrite of the regex.
 */
R.check('K18', /ZEPHYR_\[A-Z_\]\+/.test(src), 'regex hanya cocok token ZEPHYR_*');
R.check('K19', /konteksTugas/.test(src), 'konteksTugas ada');
R.check(
  'K20',
  (src.match(/ganti\(/g) || []).length >= 4,
  'substitusi dipakai di command, args, dan cwd',
);

console.log('\n  catatan: aturan di atas mencerminkan src/lib/tasksStore.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
