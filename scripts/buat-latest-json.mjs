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
 */
import fs from 'node:fs';
import path from 'node:path';

const VERSI = '1.1.13';
const DIR = `release/${VERSI}`;
const REPO = 'ShinRyu04/Zephyr';

const bacaSig = (p) => {
  if (!fs.existsSync(p)) throw new Error(`tanda tangan tidak ada: ${p}`);
  const s = fs.readFileSync(p, 'utf8').trim();
  if (s.length < 100) throw new Error(`tanda tangan terlalu pendek: ${p}`);
  return s;
};

/* Catatan versi diambil dari berkas catatan bahasa Inggris: itu yang dikirim
   updater ke semua pengguna, dan bahasa lain tetap tersedia sebagai berkas. */
const catatan = fs.readFileSync(`release/${VERSI}/notes/RELEASE_NOTES_${VERSI}.en.md`, 'utf8');

const setup = `Zephyr_${VERSI}_x64-setup.exe`;
const appimage = `Zephyr_${VERSI}_amd64.AppImage`;

const latest = {
  version: VERSI,
  notes: catatan,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms: {
    'windows-x86_64': {
      signature: bacaSig(`${DIR}/${setup}.sig`),
      url: `https://github.com/${REPO}/releases/download/v${VERSI}/${setup}`,
    },
    'linux-x86_64': {
      signature: bacaSig(`${DIR}/linux/${appimage}.sig`),
      url: `https://github.com/${REPO}/releases/download/v${VERSI}/${appimage}`,
    },
  },
};

fs.writeFileSync(`${DIR}/latest.json`, JSON.stringify(latest, null, 2) + '\n');

/* Diperiksa ulang setelah ditulis: tanda tangan yang tertukar atau URL yang
   salah tidak bisa terlihat dari penulisan yang "berhasil". */
const ulang = JSON.parse(fs.readFileSync(`${DIR}/latest.json`, 'utf8'));
for (const [plat, info] of Object.entries(ulang.platforms)) {
  const url = info.url;
  const namaDiUrl = url.split('/').pop();
  const cocok = namaDiUrl === setup || namaDiUrl === appimage;
  console.log(`${plat}: ${cocok ? 'OK ' : 'SALAH'} signature=${info.signature.length} char, nama di URL=${namaDiUrl}`);
  if (!cocok) throw new Error(`nama berkas di URL tidak cocok: ${namaDiUrl}`);
  if (info.signature.length < 100) throw new Error(`signature ${plat} mencurigakan`);
}
/* Nama di URL harus sama dengan nama berkas yang benar-benar ada. */
const adaWindows = fs.existsSync(`${DIR}/${setup}`);
const adaLinux = fs.existsSync(`${DIR}/linux/${appimage}`);
console.log(`berkas ada: windows=${adaWindows} linux=${adaLinux}`);
if (!adaWindows || !adaLinux) throw new Error('berkas yang dirujuk latest.json belum ada');
console.log(`\nlatest.json ${VERSI} ditulis dan diperiksa.`);
