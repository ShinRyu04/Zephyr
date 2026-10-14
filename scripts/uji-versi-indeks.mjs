/*
 * uji-versi-indeks.mjs - harness bukti untuk item ZEPH-VERSI-INDEKS-BASI.
 *
 * Yang dibuktikan (bukan diklaim):
 *   a. cap (versi app + hash sumber) yang TERSIMPAN di src/lib/zephyrIndeks.ts
 *      berbentuk benar dan bisa dibandingkan dengan cap NYATA;
 *   b. cap NYATA dihitung dari ISI berkas sumber (bukan dari waktu, locale,
 *      mtime, atau nama mesin) - dibuktikan dengan menyalin pohon sumber ke
 *      sandbox, menjalankan generator di sana, dan mencocokkan hashnya dengan
 *      hash repo nyata;
 *   c. satu byte yang berubah di satu berkas sumber MENGUBAH hash; berkas di
 *      luar daftar sumber TIDAK mengubahnya (kontrol negatif);
 *   d. versi app dibaca dari package.json dan ikut masuk cap;
 *   e. deteksi basi membandingkan cap tersimpan vs cap nyata TANPA menulis
 *      apa pun (sha1 berkas hasil generate sama sebelum & sesudah SELURUH uji);
 *   f. jumlah berkas/entri tertinggal dilaporkan dengan ANGKA nyata (cap sama ->
 *      wajib 0 tertinggal & 0 keluhan; cap beda -> wajib ada bukti tertinggal);
 *   g. tidak ada jalur di harness ini yang membaca/menulis .env atau kunci API
 *      - dibuktikan dari daftar berkas yang benar-benar dibaca (`DIBACA`) dan
 *      dari daftar SUMBER_HASH milik generator, bukan dari klaim.
 *
 * Disiplin angka: pemisah ribuan dihitung sendiri (lihat `ribuan()`);
 * `toLocaleString` dan `Intl.NumberFormat` DILARANG - keluaran harness ini
 * harus byte-identik di mesin dan locale mana pun.
 *
 * Jalankan:
 *   node scripts/uji-versi-indeks.mjs                  # semua kasus
 *   node scripts/uji-versi-indeks.mjs --ringkas        # hanya ringkasan
 *   node scripts/uji-versi-indeks.mjs --tanpa-sandbox  # lewati kasus sandbox
 *
 * Exit 0 = semua kasus lulus. Exit 1 = ada yang gagal (daftarnya dicetak).
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const RINGKAS = argv.includes('--ringkas');
const TANPA_SANDBOX = argv.includes('--tanpa-sandbox');

const BERKAS_INDEKS = 'src/lib/zephyrIndeks.ts';
const BERKAS_FAKTA = 'src/lib/zephyrFakta.ts';
const GEN = 'scripts/gen-fakta-zephyr.mjs';
const CEK_SINKRON = 'scripts/cek-indeks-sinkron.mjs';
const SENDIRI = 'scripts/uji-versi-indeks.mjs';

/* ------------------------------------------------------------------ */
/* utilitas                                                           */
/* ------------------------------------------------------------------ */

/** Pemisah ribuan sendiri. `toLocaleString` DILARANG: ia bergantung locale. */
function ribuan(n) {
  const s = String(n);
  const neg = s.startsWith('-');
  const digit = neg ? s.slice(1) : s;
  let keluar = '';
  for (let i = 0; i < digit.length; i++) {
    if (i > 0 && (digit.length - i) % 3 === 0) keluar += '.';
    keluar += digit[i];
  }
  return (neg ? '-' : '') + keluar;
}

/* Nama sensitif/terlarang DIBANGUN dari potongan huruf. Kalau ditulis utuh,
   pemeriksa di kasus 14 dan 15 akan mencocokkan teksnya sendiri dan selalu
   melaporkan GAGAL palsu. Yang penting: setiap kali pola ini dipakai untuk
   memeriksa, bentuk yang dicari tetap utuh - jadi kode SUNGGUHAN yang memuat
   pola terlarang tetap tertangkap, hanya deklarasinya di sini yang terbelah. */
const potong = (...p) => p.join('');
const ENV_TXT = potong('.', 'env');            // untuk pesan
const ENV_RE = potong('\\.', 'env');           // untuk RegExp
const APIKEY = potong('api', 'Key');
const API_KEY_UPPER = potong('API', '_KEY');
const TO_LOCALE = potong('toLocale', 'String');
const INTL_NF = potong('Intl.', 'Number', 'Format');
const NEW_INTL = potong('new ', 'Intl.');

/** Setiap berkas repo yang benar-benar dibaca harness ini. Bukti untuk kasus 14. */
const DIBACA = new Set();
const baca = (p) => {
  DIBACA.add(p);
  return readFileSync(join(akar, p), 'utf8');
};
const ada = (p) => existsSync(join(akar, p));
const sha1Berkas = (p) => createHash('sha1').update(readFileSync(join(akar, p))).digest('hex');

/** Jalankan node di cwd tertentu, kembalikan {kode, stdout, stderr}. */
function jalankanNode(skrip, args, cwd, env) {
  try {
    const stdout = execFileSync(process.execPath, [skrip, ...args], {
      cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
      /* stderr di-PIPE, jangan diwariskan: execFileSync default-nya meneruskan
         stderr anak ke stderr induk, sehingga pesan "TIDAK SINKRON" dari salinan
         menyusup ke keluaran harness dan tampak seperti kegagalan harness. */
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env,
    });
    return { kode: 0, stdout, stderr: '' };
  } catch (e) {
    return { kode: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? e.message ?? '') };
  }
}

/** Cap tersimpan: dibaca dari artefak yang dibundel, bukan dari generator. */
function bacaCapTersimpan(cwd = akar, berkas = BERKAS_INDEKS) {
  const isi = readFileSync(join(cwd, berkas), 'utf8');
  const m = /FAKTA_VERSI = \{ aplikasi: '([^']+)', hashSumber: '([^']+)' \}/.exec(isi);
  if (!m) return null;
  return { aplikasi: m[1], hashSumber: m[2] };
}

let N_GEN = 0;
/** Cap NYATA: tanya generatornya sendiri lewat --print-cakupan (tidak menulis). */
function bacaCapNyata(cwd = akar, env) {
  N_GEN++;
  const r = jalankanNode(GEN, ['--print-cakupan'], cwd, env);
  if (r.kode !== 0) return { error: (r.stderr || r.stdout || 'gagal').split('\n')[0] };
  try {
    const j = JSON.parse(r.stdout.trim().split('\n')[0]);
    return {
      aplikasi: String(j.versi),
      hashSumber: String(j.hashSumber),
      jumlah: j.jumlah ?? {},
      jumlahEntri: Object.values(j.jumlah ?? {}).reduce((a, b) => a + b, 0),
      mentah: r.stdout,
    };
  } catch (e) {
    return { error: `cakupan tidak bisa diparse: ${e.message}` };
  }
}

/** Jumlah entri yang benar-benar tertulis di artefak (parser sama seperti cek-indeks-sinkron). */
function jumlahEntriArtefak(cwd = akar, berkas = BERKAS_INDEKS) {
  const isi = readFileSync(join(cwd, berkas), 'utf8').replace(/\r/g, '');
  let total = 0;
  const perKat = {};
  for (const baris of isi.split('\n')) {
    const m = /^\s*\["([a-z]+)","((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\],?$/.exec(baris);
    if (m) { total++; perKat[m[1]] = (perKat[m[1]] ?? 0) + 1; }
  }
  return { total, perKat };
}

/* Deteksi basi: logika yang DIUSULKAN untuk kode produk (docs/USULAN-VERSI-INDEKS.md).
   Murni fungsi - tidak menyentuh berkas apa pun. */
function deteksiBasi(capTersimpan, capNyata) {
  if (!capTersimpan || !capNyata) return { basi: null, alasan: 'cap tidak lengkap' };
  const sebab = [];
  if (capTersimpan.aplikasi !== capNyata.aplikasi) sebab.push(`versi ${capTersimpan.aplikasi} != ${capNyata.aplikasi}`);
  if (capTersimpan.hashSumber !== capNyata.hashSumber) sebab.push(`hash ${capTersimpan.hashSumber} != ${capNyata.hashSumber}`);
  return { basi: sebab.length > 0, alasan: sebab.join('; ') || 'cap sama' };
}

/* ------------------------------------------------------------------ */
/* sandbox: salinan pohon sumber untuk uji perturbasi 1 byte          */
/* ------------------------------------------------------------------ */

/* Nama sandbox memuat PID: kalau sisa jalan sebelumnya masih terkunci Windows
   (EPERM pada rm -rf), jalan ini tetap dapat direktori sendiri yang bersih. */
const SANDBOX = join(tmpdir(), `zephyr-uji-versi-indeks-lab-${process.pid}`);

/* Windows kadang menahan handle sebentar setelah anak proses keluar: rmSync
   bawaan langsung EPERM. Ulangi beberapa kali sebelum menyerah. */
function hapusKeras(p) {
  try {
    rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    return true;
  } catch (e) {
    return false;
  }
}

/* Hal yang memang tidak dibaca generator tidak disalin: src-tauri/target saja
   sudah ratusan MB. */
const LEWATI_SALIN = new Set(['target', 'node_modules', '.git', 'dist', '.vite', 'coverage', 'release']);
const saring = (sumber) => !LEWATI_SALIN.has(String(sumber).split(/[\\/]/).pop());
const salin = (dari, ke) => cpSync(dari, ke, { recursive: true, filter: saring });

let cwdSandbox = null;
function siapkanSandbox() {
  if (cwdSandbox) return cwdSandbox;
  if (!hapusKeras(SANDBOX)) throw new Error(`tidak bisa membersihkan ${SANDBOX} (masih terkunci?)`);
  mkdirSync(SANDBOX, { recursive: true });
  /* Yang dibaca generator: seluruh src, src-tauri/src, src-tauri/tauri.conf.json,
     package.json, vite.config.ts, dan dokumen bundel (README, ARCHITECTURE,
     AGENTS, CHANGELOG, SECURITY, RELEASE_NOTES, dan seluruh isi docs). */
  for (const p of ['src', 'docs', 'package.json', 'vite.config.ts', 'tsconfig.json', 'index.html']) {
    if (ada(p)) salin(join(akar, p), join(SANDBOX, p));
  }
  mkdirSync(join(SANDBOX, 'src-tauri'), { recursive: true });
  cpSync(join(akar, 'src-tauri', 'tauri.conf.json'), join(SANDBOX, 'src-tauri', 'tauri.conf.json'));
  if (ada('src-tauri/src')) salin(join(akar, 'src-tauri', 'src'), join(SANDBOX, 'src-tauri', 'src'));
  for (const f of ['README.md', 'ARCHITECTURE.md', 'AGENTS.md', 'CHANGELOG.md', 'SECURITY.md', 'RELEASE_NOTES.md']) {
    if (ada(f)) cpSync(join(akar, f), join(SANDBOX, f));
  }
  mkdirSync(join(SANDBOX, 'scripts'), { recursive: true });
  cpSync(join(akar, GEN), join(SANDBOX, GEN));
  cwdSandbox = SANDBOX;
  return cwdSandbox;
}
function resetSandbox() {
  cwdSandbox = null;
  hapusKeras(SANDBOX);
}

/* ------------------------------------------------------------------ */
/* kerangka uji                                                       */
/* ------------------------------------------------------------------ */

const KASUS = [];
const SESUDAH = [];
const kasus = (no, nama, fn, opsi = {}) => {
  const k = { no, nama, fn, ...opsi };
  (opsi.setelah ? SESUDAH : KASUS).push(k);
};
const harapan = (benar, detail = '') => ({ benar: !!benar, detail });
const konteks = {};

/* DAFTAR KASUS
   1  cap tersimpan berbentuk benar
   2  cap nyata dari generator --print-cakupan
   3  hash = fungsi ISI sumber: salinan sepadan -> hash sepadan
   4  hash byte-identik antar dua pemanggilan
   5  hash tidak bergantung locale / env mesin
   6  satu byte sumber berubah -> hash berubah
   7  berkas di luar daftar sumber berubah -> hash tetap (kontrol negatif)
   8  versi app dibaca dari package.json dan ikut masuk cap
   9  versi berubah -> cap.aplikasi berubah
   10 deteksi basi TIDAK menulis apa pun (dijalankan paling akhir)
   11 deteksi basi: cap beda -> basi, cap sama -> segar
   12 jumlah berkas/entri tertinggal dilaporkan dengan ANGKA nyata
   13 jumlah entri tersimpan cocok antara dua parser independen
   14 tidak ada jalur baca/tulis .env atau kunci API
   15 pemisah ribuan dihitung sendiri (bukan toLocaleString)
   16 `--check` tidak menulis berkas (salinan tetap byte-identik)
   17 cap hash berformat 16 huruf hex kecil
   18 cap nyata rekonsiliasi dengan angka cek-indeks-sinkron
*/

kasus(1, 'cap tersimpan di src/lib/zephyrIndeks.ts terbaca & berbentuk benar', () => {
  const cap = bacaCapTersimpan();
  konteks.capTersimpan = cap;
  if (!cap) return harapan(false, 'FAKTA_VERSI tidak ditemukan di artefak');
  const bentuk = /^\d+\.\d+\.\d+/.test(cap.aplikasi) && /^[0-9a-f]{16}$/.test(cap.hashSumber);
  return harapan(bentuk, `cap tersimpan: aplikasi=${cap.aplikasi}, hashSumber=${cap.hashSumber}`);
});

kasus(2, 'cap nyata dari `gen-fakta-zephyr.mjs --print-cakupan` terbaca (tanpa menulis)', () => {
  const cap = bacaCapNyata();
  konteks.capNyata = cap;
  if (cap.error) return harapan(false, cap.error);
  const bentuk = /^\d+\.\d+\.\d+/.test(cap.aplikasi) && /^[0-9a-f]{16}$/.test(cap.hashSumber);
  return harapan(bentuk && cap.jumlahEntri > 1000,
    `cap nyata: aplikasi=${cap.aplikasi}, hashSumber=${cap.hashSumber}, ${ribuan(cap.jumlahEntri)} entri ` +
    `(${Object.entries(cap.jumlah).map(([k, v]) => `${k}=${v}`).join(', ')})`);
});

kasus(4, 'hash byte-identik antar dua pemanggilan (deterministik)', () => {
  const a = bacaCapNyata();
  const b = bacaCapNyata();
  if (a.error || b.error) return harapan(false, a.error ?? b.error);
  return harapan(a.hashSumber === b.hashSumber && a.mentah === b.mentah,
    `pemanggilan 1 -> ${a.hashSumber}, pemanggilan 2 -> ${b.hashSumber}; keluaran utuh ${a.mentah === b.mentah ? 'sama persis' : 'BERBEDA'} ` +
    `(${ribuan(a.mentah.length)} byte vs ${ribuan(b.mentah.length)} byte)`);
});

kasus(5, 'hash tidak bergantung locale/env mesin', () => {
  const a = bacaCapNyata(akar, { LC_ALL: 'id_ID.UTF-8', LANG: 'id_ID.UTF-8', TZ: 'Asia/Jakarta' });
  const b = bacaCapNyata(akar, { LC_ALL: 'C', LANG: 'C', TZ: 'UTC' });
  if (a.error || b.error) return harapan(false, a.error ?? b.error);
  return harapan(a.hashSumber === b.hashSumber,
    `LC_ALL=id_ID.UTF-8/TZ=Asia/Jakarta -> ${a.hashSumber} vs LC_ALL=C/TZ=UTC -> ${b.hashSumber}; ` +
    `hash hanya dari nama berkas RELATIF + isi byte, jadi nama mesin, HOME, dan jam tidak masuk`);
});

kasus(8, 'versi app dibaca dari package.json dan ikut masuk cap', () => {
  const pkg = JSON.parse(baca('package.json')).version;
  const tauri = JSON.parse(baca('src-tauri/tauri.conf.json')).version;
  const cap = konteks.capTersimpan ?? bacaCapTersimpan();
  return harapan(cap.aplikasi === pkg && cap.aplikasi === tauri,
    `package.json=${pkg}, tauri.conf.json=${tauri}, cap.aplikasi=${cap.aplikasi} - ketiganya sama; ` +
    `generator mendahulukan tauri.conf.json dan package.json jadi cadangannya (versiAplikasi(), gen-fakta-zephyr.mjs baris 1187-1191)`);
});

kasus(17, 'cap hash berformat 16 huruf hex kecil (tersimpan & nyata)', () => {
  const tersimpan = konteks.capTersimpan ?? bacaCapTersimpan();
  const nyata = konteks.capNyata ?? bacaCapNyata();
  const ok = (s) => typeof s === 'string' && /^[0-9a-f]{16}$/.test(s);
  return harapan(ok(tersimpan.hashSumber) && !nyata.error && ok(nyata.hashSumber),
    `tersimpan=${tersimpan.hashSumber} (${tersimpan.hashSumber.length} huruf), nyata=${nyata.hashSumber ?? nyata.error} ` +
    `(${(nyata.hashSumber ?? '').length} huruf) - sha1 dipotong 16, sama seperti cap di kode produk`);
});

kasus(15, potong('pemisah ribuan dihitung sendiri (', TO_LOCALE, '/', INTL_NF, ' DILARANG)'), () => {
  const uji = [[0, '0'], [3, '3'], [421, '421'], [6212, '6.212'], [1234567, '1.234.567'], [-1234, '-1.234']];
  const salah = uji.filter(([n, s]) => ribuan(n) !== s);
  /* Komentar dibuang lebih dulu: prosa di header menyebut nama fungsi ini. */
  const sumber = baca(SENDIRI).replace(/\/\*[\s\S]*?\*\//g, '');
  const reTL = new RegExp('\\.' + TO_LOCALE + '\\s*\\(');
  const reNF = new RegExp(INTL_NF.replace('.', '\\s*\\.\\s*'));
  const reNewIntl = new RegExp(NEW_INTL.replace(' ', '\\s*'));
  const terlarang = [];
  if (reTL.test(sumber)) terlarang.push(TO_LOCALE);
  if (reNF.test(sumber)) terlarang.push(INTL_NF);
  if (reNewIntl.test(sumber)) terlarang.push(NEW_INTL);
  /* Kontrol positif: pemeriksa ini harus BENAR-BENAR menangkap pelanggaran,
     bukan cuma tidak menemukan apa pun di berkas ini. */
  const jebakanTL = potong('const jam = x.', TO_LOCALE, '(1);');
  const jebakanNF = `const n = ${potong('Intl.', 'Number', 'Format')}(1);`;
  const kontrol = reTL.test(jebakanTL) && reNF.test(jebakanNF);
  return harapan(salah.length === 0 && terlarang.length === 0 && kontrol,
    salah.length ? `format salah untuk ${salah.map(([n]) => n).join(', ')}` :
      `ribuan(6212)='${ribuan(6212)}', ribuan(1234567)='${ribuan(1234567)}', ribuan(-1234)='${ribuan(-1234)}'; ` +
      `pola terlarang di sumber harness: ${terlarang.join(', ') || 'tidak ada'}; ` +
      `kontrol positif (jebakan harus tertangkap): ${kontrol}`);
});

kasus(11, 'deteksi basi: cap beda -> basi, cap sama -> segar', () => {
  const tersimpan = konteks.capTersimpan ?? bacaCapTersimpan();
  const nyata = konteks.capNyata ?? bacaCapNyata();
  if (nyata.error) return harapan(false, nyata.error);
  const sekarang = deteksiBasi(tersimpan, nyata);
  const sepadan = deteksiBasi(tersimpan, tersimpan);
  const kontrol = deteksiBasi(tersimpan, { aplikasi: tersimpan.aplikasi, hashSumber: '0'.repeat(16) });
  const kontrolVersi = deteksiBasi(tersimpan, { aplikasi: '0.0.0', hashSumber: tersimpan.hashSumber });
  /* ATURAN (bukan keadaan repo): basi HARUS == "cap tersimpan != cap nyata".
     Indeks segar -> basi=false SAH; indeks basi -> basi=true WAJIB. Arah
     "beda -> basi" dibuktikan kontrol sintetis di bawah, jadi kasus ini tidak
     lagi mengunci keadaan "repo sedang basi" (dulu: menuntut basi===true). */
  const bedaCap = tersimpan.aplikasi !== nyata.aplikasi || tersimpan.hashSumber !== nyata.hashSumber;
  return harapan(sekarang.basi === bedaCap && sepadan.basi === false && kontrol.basi === true && kontrolVersi.basi === true,
    `cap tersimpan ${tersimpan.aplikasi}/${tersimpan.hashSumber} vs cap nyata ${nyata.aplikasi}/${nyata.hashSumber} -> bedaCap=${bedaCap}; ` +
    `tersimpan vs nyata -> basi=${sekarang.basi} (WAJIB = bedaCap); tersimpan vs tersimpan -> basi=${sepadan.basi}; ` +
    `hash dibuat 0000 -> basi=${kontrol.basi}; versi dibuat 0.0.0 -> basi=${kontrolVersi.basi}`);
});

kasus(12, 'jumlah berkas/entri tertinggal dilaporkan dengan ANGKA nyata', () => {
  const r = jalankanNode(CEK_SINKRON, [], akar);
  konteks.cekSinkron = r;
  const keluaran = `${r.stdout}\n${r.stderr}`;
  const mKode = /semua berkas sumber punya entri peta kode \((\d+)\/(\d+)\)/.exec(keluaran);
  const mArtefak = /artefak terbaca \((\d+) entri\)/.exec(keluaran);
  const mCap = /artefak terbaca \(\d+ entri\) - \d+ byte, cap ([^ ]+) \/ ([0-9a-f]+)/.exec(keluaran);
  const mBaris = /jumlah baris masih cocok \((\d+)\/(\d+)\)/.exec(keluaran);
  const mLabel = /label\/teks permukaan bisa dicari \((\d+)\/(\d+)\)/.exec(keluaran);
  const mKeluhan = /(\d+) keluhan/.exec(keluaran);
  if (!mKode || !mArtefak || !mBaris) return harapan(false, `keluaran cek-indeks-sinkron tidak terbaca (kode ${r.kode})`);
  const artefak = jumlahEntriArtefak();
  const nyata = konteks.capNyata ?? bacaCapNyata();
  const tertinggal = Object.entries(nyata.jumlah ?? {})
    .map(([k, v]) => [k, v - (artefak.perKat[k] ?? 0)])
    .filter(([, d]) => d !== 0);
  konteks.angka = {
    berkasTanpaEntri: Number(mKode[2]) - Number(mKode[1]),
    berkasTotal: Number(mKode[2]),
    berkasBarisGeser: Number(mBaris[2]) - Number(mBaris[1]),
    labelTidakTerjangkau: mLabel ? Number(mLabel[2]) - Number(mLabel[1]) : null,
    entriStored: Number(mArtefak[1]),
    entriNyata: nyata.error ? null : nyata.jumlahEntri,
    selisihEntri: nyata.error ? null : nyata.jumlahEntri - Number(mArtefak[1]),
    tertinggal,
    capStored: mCap ? `${mCap[1]} / ${mCap[2]}` : '?',
    keluhan: mKeluhan ? Number(mKeluhan[1]) : null,
  };
  const a = konteks.angka;
  const angkaWaras = [a.berkasTanpaEntri, a.berkasTotal, a.berkasBarisGeser, a.entriStored, a.selisihEntri]
    .every((n) => Number.isInteger(n) && n >= 0) && a.berkasTotal > a.berkasTanpaEntri;
  const buktiBasi = a.selisihEntri > 0 || a.berkasTanpaEntri > 0 || a.berkasBarisGeser > 0;
  /* ATURAN dua arah (bukan "repo wajib basi"): cap sama -> SEMUA angka
     tertinggal WAJIB 0 dan keluhan WAJIB 0; cap beda -> WAJIB ada bukti
     tertinggal. Dulu kasus ini menuntut buktiBasi selalu true. */
  const tersimpanAngka = konteks.capTersimpan ?? bacaCapTersimpan();
  const capSama = tersimpanAngka.aplikasi === nyata.aplikasi && tersimpanAngka.hashSumber === nyata.hashSumber;
  const segar = a.selisihEntri === 0 && a.berkasTanpaEntri === 0 && a.berkasBarisGeser === 0 && (a.keluhan === null || a.keluhan === 0);
  return harapan(angkaWaras && (capSama ? segar : buktiBasi),
    `cap tersimpan ${a.capStored} vs cap nyata ${nyata.aplikasi ?? '?'} / ${nyata.hashSumber ?? '?'}; ` +
    `berkas sumber tanpa entri peta kode ${ribuan(a.berkasTanpaEntri)} dari ${ribuan(a.berkasTotal)}, ` +
    `baris bergeser di ${ribuan(a.berkasBarisGeser)} berkas, label tak terjangkau ${a.labelTidakTerjangkau ?? '?'}, ` +
    `entri ${ribuan(a.entriStored)} tersimpan vs ${ribuan(a.entriNyata)} nyata (tertinggal ${ribuan(a.selisihEntri)}: ` +
    `${a.tertinggal.map(([k, d]) => `${k}+${d}`).join(', ')}), keluhan cek-indeks-sinkron ${a.keluhan}; ` +
    `capSama=${capSama} -> wajib ${capSama ? 'semua angka tertinggal 0 DAN keluhan 0 (segar=' + segar + ')' : 'ada bukti tertinggal (buktiBasi=' + buktiBasi + ')'}`);
});

kasus(13, 'jumlah entri tersimpan cocok antara dua parser independen', () => {
  const sendiri = jumlahEntriArtefak();
  const keluaran = `${konteks.cekSinkron?.stdout ?? ''}\n${konteks.cekSinkron?.stderr ?? ''}`;
  const m = /artefak terbaca \((\d+) entri\) - (\d+) byte/.exec(keluaran);
  if (!m) return harapan(false, 'keluaran cek-indeks-sinkron tidak ada (kasus 12 harus jalan lebih dulu)');
  const deklarasi = /export const FAKTA_INDEKS: readonly FaktaEntri\[\] = \[/.test(baca(BERKAS_INDEKS));
  const kategoriDeklarasi = /export const FAKTA_KATEGORI: readonly FaktaKategori\[\] = \[/.test(baca(BERKAS_INDEKS));
  return harapan(Number(m[1]) === sendiri.total && deklarasi && kategoriDeklarasi,
    `parser harness -> ${ribuan(sendiri.total)} entri, parser cek-indeks-sinkron -> ${ribuan(Number(m[1]))} entri, ` +
    `berkas ${ribuan(Number(m[2]))} byte; ${BERKAS_INDEKS} mendeklarasikan FAKTA_INDEKS=${deklarasi}, FAKTA_KATEGORI=${kategoriDeklarasi}`);
});

kasus(14, potong('tidak ada jalur baca/tulis ', ENV_TXT, ' atau kunci API'), () => {
  /* Sumber harness sendiri. Dua penjaga supaya pemeriksa ini tidak menuduh
     dirinya sendiri: (1) komentar dibuang, karena header menyebut nama berkas
     rahasia sebagai prosa; (2) SETIAP pola dibangun dari potongan huruf
     (ENV_TXT/ENV_RE/APIKEY/API_KEY_UPPER) sehingga bentuk yang diuji tidak
     pernah muncul utuh di berkas ini - sementara kode sungguhan yang memuatnya
     tetap tertangkap (dibuktikan kontrol positif di bawah). */
  const sumber = baca(SENDIRI).replace(/\/\*[\s\S]*?\*\//g, '');
  const pola = [
    [new RegExp("['\"][^'\"\\n]*" + ENV_RE + "[^'\"\\n]*['\"]"), potong('menyentuh berkas ', ENV_TXT)],
    [new RegExp('\\b' + API_KEY_UPPER + '\\b'), potong('nama env kunci ', API_KEY_UPPER)],
    [new RegExp('\\b' + APIKEY + '\\b'), potong('variabel ', APIKEY)],
  ];
  const jebakanEnv = potong('const p = "app/.', ENV_TXT, '";');
  const jebakanKey = potong('const k = process', ENV_TXT, '.', API_KEY_UPPER, ';');
  const kontrol = pola[0][0].test(jebakanEnv) && pola[1][0].test(jebakanKey);
  const kena = pola.filter(([re]) => re.test(sumber)).map(([, n]) => n);
  const berkasDibaca = [...DIBACA];
  const takAman = berkasDibaca.filter((p) =>
    new RegExp(ENV_RE + '|\\.pem$|\\.key$|credential|secret', 'i').test(p));
  const gen = baca(GEN);
  const blok = /const SUMBER_HASH = \[([\s\S]*?)\n\];/.exec(gen);
  const daftarKena = blok
    ? blok[1].split('\n').map((b) => b.trim())
        .filter((b) => /^['"]/.test(b) && new RegExp(ENV_RE + '|key|secret|token|credential', 'i').test(b))
    : [potong('(SUMBER_HASH tidak ', 'terbaca)')];
  const bacaKeyEnv = new RegExp('process' + ENV_TXT + '\\.[A-Z_]*(KEY|TOKEN|SECRET)', 'i').test(sumber);
  return harapan(kena.length === 0 && takAman.length === 0 && daftarKena.length === 0 && !bacaKeyEnv && kontrol,
    `harness: ${kena.join(', ') || potong('tidak ada pola ', ENV_TXT, '/kunci')}; ` +
    `kontrol positif (jebakan harus tertangkap): ${kontrol}; ` +
    `membaca ${potong('process', ENV_TXT)} berisi kunci: ${bacaKeyEnv}; ` +
    `berkas repo yang benar-benar dibaca harness (${berkasDibaca.length}): ${berkasDibaca.join(', ')}` +
    `${takAman.length ? ` - TAK AMAN: ${takAman.join(', ')}` : potong(' -> tidak ada ', ENV_TXT, '/.pem/.key')}; ` +
    `SUMBER_HASH generator: ${daftarKena.length ? `TAK AMAN ${daftarKena.join(' | ')}` : 'tidak memuat nama berkas sensitif'}`);
});

kasus(9, 'versi berubah -> cap.aplikasi berubah (versi ikut masuk cap)', () => {
  const sandbox = siapkanSandbox();
  const sebelum = bacaCapNyata(sandbox);
  if (sebelum.error) return harapan(false, `salinan: ${sebelum.error}`);
  const jalurTauri = join(sandbox, 'src-tauri', 'tauri.conf.json');
  const tauri = JSON.parse(readFileSync(jalurTauri, 'utf8'));
  tauri.version = '9.9.9';
  writeFileSync(jalurTauri, `${JSON.stringify(tauri, null, 2)}\n`, 'utf8');
  const sesudahTauri = bacaCapNyata(sandbox);
  const jalurPkg = join(sandbox, 'package.json');
  const pkg = JSON.parse(readFileSync(jalurPkg, 'utf8'));
  pkg.version = '8.8.8';
  writeFileSync(jalurPkg, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  const sesudahPkg = bacaCapNyata(sandbox);
  return harapan(!sesudahTauri.error && !sesudahPkg.error &&
    sesudahTauri.aplikasi === '9.9.9' && sesudahPkg.aplikasi === '9.9.9',
    `di salinan: cap ${sebelum.aplikasi} -> tauri.conf.json=9.9.9 -> ${sesudahTauri.aplikasi} -> ` +
    `package.json=8.8.8 (tauri tetap 9.9.9) -> ${sesudahPkg.aplikasi}; hash ${sebelum.hashSumber} -> ${sesudahTauri.hashSumber} ` +
    `(hash sendiri tidak memuat versi - versi masuk cap lewat field aplikasi)`);
});

kasus(3, 'hash = fungsi ISI sumber: salinan pohon sepadan -> hash sepadan', () => {
  resetSandbox();
  const sandbox = siapkanSandbox();
  const repo = konteks.capNyata ?? bacaCapNyata();
  const lab = bacaCapNyata(sandbox);
  if (lab.error) return harapan(false, `salinan: ${lab.error}`);
  if (repo.error) return harapan(false, repo.error);
  const beda = [...new Set([...Object.keys(lab.jumlah ?? {}), ...Object.keys(repo.jumlah ?? {})])]
    .map((k) => [k, (repo.jumlah?.[k] ?? 0) - (lab.jumlah?.[k] ?? 0)])
    .filter(([, d]) => d !== 0);
  return harapan(lab.hashSumber === repo.hashSumber,
    `repo ${repo.hashSumber} vs salinan ${sandbox} -> ${lab.hashSumber}; entri ${ribuan(lab.jumlahEntri)} vs ${ribuan(repo.jumlahEntri)}, ` +
    `selisih per kategori: ${beda.map(([k, d]) => `${k}-${d}`).join(', ') || 'tidak ada'}. ` +
    `Dua fakta itu digabung: hash IDENTIK padahal jumlah entri BEDA -> semua berkas yang masuk daftar hash ada & byte-sepadan di salinan ` +
    `(sebab itu hash sama), sementara pemindai entri juga membaca berkas yang tidak ikut tersalin (sebab itu entri beda) -> ` +
    `daftar berkas hash adalah himpunan BAGIAN dari berkas yang dipindai entri, dan hashnya murni fungsi (nama relatif + isi byte), bukan mesin/waktu/locale`);
});

kasus(6, 'satu byte di satu berkas sumber mengubah hash', () => {
  const sandbox = siapkanSandbox();
  const sebelum = bacaCapNyata(sandbox);
  if (sebelum.error) return harapan(false, sebelum.error);
  /* `src/lib/commandRegistry.ts` ada di SUMBER_HASH generator (baris 1177). */
  const sasaran = 'src/lib/commandRegistry.ts';
  const jalur = join(sandbox, ...sasaran.split('/'));
  const asli = readFileSync(jalur, 'utf8');
  const pos = asli.indexOf('export');
  if (pos < 0) return harapan(false, `${sasaran} tidak memuat 'export' - tidak bisa menyentuh 1 byte`);
  const diubah = `${asli.slice(0, pos)}exporu${asli.slice(pos + 'export'.length)}`;
  writeFileSync(jalur, diubah, 'utf8');
  const sesudah = bacaCapNyata(sandbox);
  const panjangSama = asli.length === diubah.length;
  return harapan(!sesudah.error && panjangSama && sesudah.hashSumber !== sebelum.hashSumber,
    `${sasaran}: "expor[t]" -> "expor[u]" (1 byte; panjang ${ribuan(asli.length)} byte tetap: ${panjangSama}) -> ` +
    `hash ${sebelum.hashSumber} menjadi ${sesudah.hashSumber ?? sesudah.error}`);
});

kasus(7, 'kontrol negatif: berkas di luar daftar sumber tidak mengubah hash', () => {
  resetSandbox();
  const sandbox = siapkanSandbox();
  const nol = bacaCapNyata(sandbox);
  if (nol.error) return harapan(false, nol.error);
  writeFileSync(join(sandbox, 'CATATAN-LAB.txt'), 'berkas ini tidak dibaca hashSumber\n', 'utf8');
  const setelahTxt = bacaCapNyata(sandbox);
  writeFileSync(join(sandbox, 'src', 'lib', 'zz-lab.test.tsx'), 'export const x = 1;\n', 'utf8');
  const setelahTest = bacaCapNyata(sandbox);
  const okTxt = !setelahTxt.error && setelahTxt.hashSumber === nol.hashSumber;
  const okTest = !setelahTest.error && setelahTest.hashSumber === nol.hashSumber;
  const entriNaik = setelahTest.jumlahEntri - nol.jumlahEntri;
  return harapan(okTxt && okTest,
    `hash tetap ${nol.hashSumber} setelah menambah CATATAN-LAB.txt (${setelahTxt.hashSumber ?? setelahTxt.error}) dan ` +
    `src/lib/zz-lab.test.tsx (${setelahTest.hashSumber ?? setelahTest.error}) -> daftar berkas hash tertutup, bukan jelajah seluruh pohon. ` +
    `Catatan yang ikut ketahuan: berkas uji .test.tsx TIDAK masuk hash tapi MASUK peta kode (entri ${ribuan(nol.jumlahEntri)} -> ` +
    `${ribuan(setelahTest.jumlahEntri)}, +${ribuan(entriNaik)}) - jadi hash lebih lemah daripada --check untuk perubahan seperti itu`);
});

kasus(16, '`--check` tidak menulis berkas (salinan tetap byte-identik)', () => {
  const sandbox = siapkanSandbox();
  const berkas = [join(sandbox, BERKAS_INDEKS), join(sandbox, BERKAS_FAKTA)];
  const adaSemua = berkas.every((p) => existsSync(p));
  const jejakSebelum = berkas.map((p) => (existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : 'tidak ada'));
  N_GEN++;
  const r = jalankanNode(GEN, ['--check'], sandbox);
  const jejakSesudah = berkas.map((p) => (existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : 'tidak ada'));
  const sama = jejakSebelum.every((s, i) => s === jejakSesudah[i]);
  const barisGalat = (r.stderr || r.stdout).trim().split('\n').filter(Boolean)[0] ?? '(tanpa keluaran)';
  return harapan(sama && adaSemua,
    `${adaSemua ? 'berkas hasil generate ada di salinan' : 'berkas hasil generate TIDAK ada di salinan'}; ` +
    `kode keluar --check=${r.kode} ("${barisGalat}"); ` +
    `sha1 ${BERKAS_INDEKS} ${jejakSebelum[0].slice(0, 12)} -> ${jejakSesudah[0].slice(0, 12)}, ` +
    `${BERKAS_FAKTA} ${jejakSebelum[1].slice(0, 12)} -> ${jejakSesudah[1].slice(0, 12)} -> tidak menulis`);
});

kasus(18, 'cap nyata rekonsiliasi dengan angka scripts/cek-indeks-sinkron.mjs', () => {
  const r = konteks.cekSinkron ?? jalankanNode(CEK_SINKRON, [], akar);
  const keluaran = `${r.stdout}\n${r.stderr}`;
  const mCap = /cap ([^ ]+) \/ ([0-9a-f]+)/.exec(keluaran);
  const mHash = /hash indeks = hash sumber sekarang \(([0-9a-f]+) vs ([0-9a-f]+)\)/.exec(keluaran);
  const adaGenCheck = /generator --check \(berkas hasil generate = sumber\)/.test(keluaran);
  const nyata = konteks.capNyata ?? bacaCapNyata();
  const tersimpan = konteks.capTersimpan ?? bacaCapTersimpan();
  if (!mCap || !mHash) return harapan(false, 'pola cap/hash tidak ditemukan di keluaran cek-indeks-sinkron');
  const cocok = mCap[2] === tersimpan.hashSumber && mHash[2] === nyata.hashSumber && mHash[1] === mCap[2] && adaGenCheck;
  return harapan(cocok,
    `cek-indeks-sinkron: cap tersimpan ${mCap[1]}/${mCap[2]} (harness: ${tersimpan.hashSumber}), ` +
    `hash nyata ${mHash[2]} (harness: ${nyata.hashSumber}), baris "generator --check" ada=${adaGenCheck}; ` +
    `keluhan ${konteks.angka?.keluhan ?? '?'}, kode keluar ${r.kode} -> ${cocok ? 'dua alat menyebut angka yang sama' : 'ADA SELISIH'}`);
});

/* ------------------------------------------------------------------ */
/* kasus 10 - dijalankan paling akhir: tidak ada yang menulis          */
/* ------------------------------------------------------------------ */

const JEJAK_AWAL = { indeks: sha1Berkas(BERKAS_INDEKS), fakta: sha1Berkas(BERKAS_FAKTA) };

kasus(10, 'deteksi basi membandingkan cap TANPA menulis apa pun', () => {
  const sesudah = { indeks: sha1Berkas(BERKAS_INDEKS), fakta: sha1Berkas(BERKAS_FAKTA) };
  const sama = sesudah.indeks === JEJAK_AWAL.indeks && sesudah.fakta === JEJAK_AWAL.fakta;
  return harapan(sama,
    `sha1 ${BERKAS_INDEKS} ${JEJAK_AWAL.indeks.slice(0, 12)} -> ${sesudah.indeks.slice(0, 12)}; ` +
    `${BERKAS_FAKTA} ${JEJAK_AWAL.fakta.slice(0, 12)} -> ${sesudah.fakta.slice(0, 12)}; ` +
    `seluruh uji (${ribuan(KASUS.length + SESUDAH.length)} kasus, ${ribuan(N_GEN)} pemanggilan generator) ` +
    `tidak menulis apa pun ke repo`);
}, { setelah: true });

/* ------------------------------------------------------------------ */
/* jalan                                                              */
/* ------------------------------------------------------------------ */

const hasil = [];
const jalankanKasus = (k) => {
  let h;
  try {
    h = k.fn();
  } catch (e) {
    h = harapan(false, `lempar: ${e.message}`);
  }
  if (!h || typeof h.benar !== 'boolean') h = harapan(false, 'kasus tidak mengembalikan hasil');
  hasil.push({ ...k, ...h });
};

for (const k of KASUS) {
  if (TANPA_SANDBOX && [3, 6, 7, 9, 16].includes(k.no)) {
    hasil.push({ ...k, benar: null, detail: 'dilewati (--tanpa-sandbox)' });
    continue;
  }
  jalankanKasus(k);
}
for (const k of SESUDAH) jalankanKasus(k);
hasil.sort((a, b) => a.no - b.no);

const gagal = hasil.filter((h) => h.benar === false);
if (!RINGKAS) {
  console.log('uji-versi-indeks - cap hash sumber + versi app (item ZEPH-VERSI-INDEKS-BASI)');
  for (const h of hasil) {
    const tanda = h.benar === null ? 'LEWAT' : h.benar ? 'ok   ' : 'GAGAL';
    console.log(`  ${tanda} ${String(h.no).padStart(2)}. ${h.nama}${h.detail ? `\n         - ${h.detail}` : ''}`);
  }
}
console.log(`\nuji-versi-indeks: ${hasil.filter((h) => h.benar === true).length}/${hasil.length} lulus, ` +
  `${gagal.length} gagal, ${hasil.filter((h) => h.benar === null).length} dilewati` +
  (konteks.angka
    ? ` - cap tersimpan ${konteks.angka.capStored} vs cap nyata ${konteks.capNyata.aplikasi}/${konteks.capNyata.hashSumber}` +
      (konteks.angka.selisihEntri != null
        ? `; tertinggal ${ribuan(konteks.angka.berkasTanpaEntri)} berkas peta kode dari ${ribuan(konteks.angka.berkasTotal)} dan ${ribuan(konteks.angka.selisihEntri)} entri`
        : '')
    : ''));
if (cwdSandbox) hapusKeras(SANDBOX); // bersih-bersih; kegagalan diabaikan
process.exit(gagal.length === 0 ? 0 : 1);
