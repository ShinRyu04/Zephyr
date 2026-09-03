// buat-shim.mjs — pasang perintah `zephyr` ke PATH user (fase 28).
//
// Pakai:
//   node scripts/buat-shim.mjs            # pasang (exe dev/release yang ada)
//   node scripts/buat-shim.mjs --hapus    # lepas dari PATH
//
// KEPUTUSAN ARSITEKTUR
//
// 1. Shim BUKAN symlink/hardlink ke zephyr.exe. Alasannya nyata: zephyr.exe
//    adalah aplikasi GUI (windows_subsystem="windows" di release), jadi saat
//    dipanggil dari terminal ia LANGSUNG melepas shell tanpa menunggu — dan
//    `--wait` mustahil. Shim .cmd yang menunggu penanda file menyelesaikan itu
//    tanpa mengubah subsystem exe (mengubahnya membuat console hitam muncul
//    tiap kali app dibuka dari ikon).
//
// 2. Dipasang ke %LOCALAPPDATA%\Programs\zephyr\bin — sesuai brief fase 28,
//    dan folder itu milik user sehingga TIDAK butuh admin. Menulis ke
//    C:\Windows\System32 butuh elevasi dan mengotori folder sistem.
//
// 3. PATH diubah lewat `setx` pada HKCU, bukan registry sistem. Perubahan
//    hanya berlaku untuk terminal BARU — itu perilaku Windows, bukan bug, dan
//    skrip mengatakannya apa adanya alih-alih diam.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { isiCmd, isiPs1 } from './shim-template.mjs';

const HAPUS = process.argv.includes('--hapus');

const local = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData/Local');
const binDir = path.join(local, 'Programs', 'zephyr', 'bin');
const shimCmd = path.join(binDir, 'zephyr.cmd');
const shimPs1 = path.join(binDir, 'zephyr.ps1');

// Exe mana yang dipakai: yang PALING BARU (mtime), bukan "release kalau ada".
//
// Alasannya nyata dan sudah kena: saat dev, release/zephyr.exe bisa jauh lebih
// tua daripada debug — shim yang menunjuk exe basi menjalankan versi tanpa
// fitur yang sedang diuji, dan gejalanya membingungkan (--wait-token diabaikan
// diam-diam, single-instance tidak aktif sehingga jendela kedua terbuka).
// `--exe <path>` memaksa pilihan tertentu.
const akar = path.resolve(import.meta.dirname, '..');
const iExe = process.argv.indexOf('--exe');
const paksaExe = iExe >= 0 ? process.argv[iExe + 1] : null;

const kandidat = [
  path.join(akar, 'src-tauri', 'target', 'release', 'zephyr.exe'),
  path.join(akar, 'src-tauri', 'target', 'debug', 'zephyr.exe'),
].filter((p) => fs.existsSync(p));

const exe = paksaExe
  ? path.resolve(paksaExe)
  : kandidat.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

function lepas() {
  for (const f of [shimCmd, shimPs1]) {
    if (fs.existsSync(f)) {
      fs.rmSync(f);
      console.log(`hapus ${f}`);
    }
  }
  const lama = bacaPathUser();
  if (lama.split(';').some((s) => s.trim().toLowerCase() === binDir.toLowerCase())) {
    const baru = lama
      .split(';')
      .filter((s) => s.trim().toLowerCase() !== binDir.toLowerCase())
      .join(';');
    setxPath(baru);
    console.log('PATH user: entri zephyr dilepas');
  }
  console.log('Selesai. Terminal yang sudah terbuka masih memuat PATH lama.');
}

function bacaPathUser() {
  // `reg query` dipakai, BUKAN process.env.PATH: env sudah gabungan
  // sistem+user, dan menulisnya kembali ke HKCU akan MENYALIN seluruh PATH
  // sistem ke user — bug klasik yang membuat PATH tumbuh dua kali tiap
  // install. Yang dibaca harus HKCU saja.
  const r = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', 'Path'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) return '';
  const m = /Path\s+REG(_EXPAND)?_SZ\s+(.*)/i.exec(r.stdout || '');
  return m ? m[2].trim() : '';
}

function setxPath(nilai) {
  // setx punya batas 1024 karakter dan MEMOTONG tanpa peringatan di atas itu.
  if (nilai.length > 1000) {
    console.error(
      `PATH user ${nilai.length} karakter — setx memotong di 1024. ` +
        'Tambahkan manual lewat Environment Variables supaya PATH tidak rusak.',
    );
    process.exit(2);
  }
  const r = spawnSync('setx', ['Path', nilai], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    console.error(`setx gagal: ${(r.stderr || '').trim()}`);
    process.exit(2);
  }
}

if (HAPUS) {
  lepas();
  process.exit(0);
}

if (!exe) {
  console.error('zephyr.exe belum ada. Jalankan `npm run tauri build` atau `cargo build` dulu.');
  process.exit(1);
}

fs.mkdirSync(binDir, { recursive: true });

// Isi shim datang dari shim-template.mjs supaya HARNESS memakai teks yang sama
// dengan produk — kalau harness menulis versinya sendiri, yang diuji bukan shim
// yang benar-benar dipakai user.
fs.writeFileSync(shimCmd, isiCmd(exe).replace(/\n/g, '\r\n'), 'utf8');
fs.writeFileSync(shimPs1, isiPs1(exe), 'utf8');
console.log(`shim: ${shimCmd}`);
console.log(`shim: ${shimPs1}`);
console.log(`exe : ${exe}`);

const pathUser = bacaPathUser();
const sudah = pathUser
  .split(';')
  .some((s) => s.trim().toLowerCase() === binDir.toLowerCase());

if (sudah) {
  console.log('PATH user: sudah memuat folder bin Zephyr');
} else {
  setxPath(pathUser ? `${pathUser};${binDir}` : binDir);
  console.log(`PATH user: + ${binDir}`);
}

console.log('');
console.log('Coba di terminal BARU:  zephyr --version');
console.log('Git commit editor    :  git config --global core.editor "zephyr --wait"');
