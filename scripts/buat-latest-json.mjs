/*
 * latest.json untuk updater dalam aplikasi.
 *
 * Bentuknya mengikuti 1.1.12 (version, notes, pub_date, platforms) supaya
 * updater yang sudah beredar tidak perlu tahu apa-apa yang baru.
 *
 * Tanda tangannya dibaca LANGSUNG dari berkas .sig yang dihasilkan build ini,
 * bukan disalin dari rilis sebelumnya. Menyalin tanda tangan lama akan membuat
 * updater menolak berkas baru dengan "signature mismatch" - dan kegagalannya
 * baru terlihat di mesin pengguna, bukan di sini.
 *
 * Field "portable" (2 Nov): url + sha256 exe tunggal portable
 * `Zephyr_<ver>_x64-portable.exe` — dibaca jalur PORTABLE di updaterStore
 * (salinan portable tidak memakai installer NSIS; ia menimpa exe-nya sendiri
 * saat keluar setelah unduhan diverifikasi).
 *
 * Versi diambil dari package.json — jangan di-hardcode lagi (1.1.13 dulu
 * membuat generator menghasilkan latest.json versi basi).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const VERSI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8')).version;
const DIR = process.argv[2] ?? `release/${VERSI}`;
const REPO = 'ShinRyu04/Zephyr';

const bacaSig = (p) => {
  if (!fs.existsSync(p)) throw new Error(`tanda tangan tidak ada: ${p}`);
  const s = fs.readFileSync(p, 'utf8').trim();
  if (s.length < 100) throw new Error(`tanda tangan terlalu pendek: ${p}`);
  return s;
};

const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/* Catatan versi: konvensi sekarang Release/<versi>/Notes/RELEASE_NOTES.md;
   berkas catatan per-bahasa lama tetap diterima kalau ada. */
const kandidatCatatan = [
  path.join(DIR, 'Notes', 'RELEASE_NOTES.md'),
  path.join(DIR, 'notes', `RELEASE_NOTES_${VERSI}.en.md`),
  path.join(DIR, 'notes', `RELEASE_NOTES_${VERSI}.md`),
];
const berkasCatatan = kandidatCatatan.find((p) => fs.existsSync(p));
if (!berkasCatatan) {
  throw new Error(`catatan rilis tidak ada — cari di: ${kandidatCatatan.join(', ')}`);
}
const catatan = fs.readFileSync(berkasCatatan, 'utf8');

const setup = `Zephyr_${VERSI}_x64-setup.exe`;
const portableExe = `Zephyr_${VERSI}_x64-portable.exe`;

const latest = {
  version: VERSI,
  notes: catatan,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms: {
    'windows-x86_64': {
      signature: bacaSig(path.join(DIR, `${setup}.sig`)),
      url: `https://github.com/${REPO}/releases/download/v${VERSI}/${setup}`,
    },
  },
  /* Jalur PORTABLE (bukan bagian skema updater Tauri — plugin mengabaikannya,
     updaterStore membacanya sendiri). */
  portable: {
    url: `https://github.com/${REPO}/releases/download/v${VERSI}/${portableExe}`,
    sha256: sha256(path.join(DIR, portableExe)),
  },
};

fs.writeFileSync(path.join(DIR, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');

/* Diperiksa ulang setelah ditulis: tanda tangan yang tertukar atau URL yang
   salah tidak bisa terlihat dari penulisan yang "berhasil". */
const ulang = JSON.parse(fs.readFileSync(path.join(DIR, 'latest.json'), 'utf8'));
for (const [plat, info] of Object.entries(ulang.platforms)) {
  const url = info.url;
  const namaDiUrl = url.split('/').pop();
  const cocok = namaDiUrl === setup;
  console.log(`${plat}: ${cocok ? 'OK ' : 'SALAH'} signature=${info.signature.length} char, nama di URL=${namaDiUrl}`);
  if (!cocok) throw new Error(`nama berkas di URL tidak cocok: ${namaDiUrl}`);
  if (info.signature.length < 100) throw new Error(`signature ${plat} mencurigakan`);
}
/* Nama di URL harus sama dengan nama berkas yang benar-benar ada. */
const adaWindows = fs.existsSync(path.join(DIR, setup));
const adaPortable = fs.existsSync(path.join(DIR, portableExe));
console.log(`berkas ada: windows=${adaWindows} portable=${adaPortable}`);
if (!adaWindows) throw new Error('berkas yang dirujuk latest.json belum ada: ' + setup);
if (!adaPortable) {
  throw new Error(
    `portable exe belum ada: ${portableExe} — jalankan package-portable-windows.mjs yang sekarang ` +
      'juga menulis salinan exe tunggal untuk updater portable',
  );
}
console.log(`\nlatest.json ${VERSI} ditulis dan diperiksa (termasuk field portable).`);
