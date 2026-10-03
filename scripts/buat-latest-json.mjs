/**
 * buat-latest-json.mjs - membuat manifes updater dari artefak yang sudah dibangun.
 *
 *   node scripts/buat-latest-json.mjs <versi>
 *
 * Manifes ini yang dibaca updater DI DALAM aplikasi. Bentuknya harus persis
 * sama dengan yang dipakai rilis sebelumnya, karena aplikasi yang sudah
 * terpasang mem-parse-nya dengan bentuk itu:
 *
 *   { version, notes, pub_date, platforms: { "<target>-<arch>": { signature, url } } }
 *
 * `signature` diambil dari berkas `.sig` yang dibuat Tauri, dan itu ISI BERKAS
 * mentah - bukan sekadar nama berkasnya. Salah di sini membuat unduhan selalu
 * ditolak dengan "signature verification failed", dan pesan itu menunjuk ke
 * installer padahal masalahnya di manifes.
 *
 * URL menunjuk ke GitHub Releases rilis yang SAMA, dengan nama berkas yang
 * harus cocok huruf per huruf - kalau tidak, updater mengunduh 404.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const versi = process.argv[2] || '1.1.13';
const dir = `D:/Zephyr/release/${versi}`;
const bundle = 'D:/Zephyr/src-tauri/target/release/bundle';
const repo = 'https://github.com/ShinRyu04/Zephyr/releases/download';

if (!existsSync(dir)) {
  console.error(`Folder rilis tidak ada: ${dir}`);
  process.exit(1);
}

/*
 * Artefak updater adalah installer NSIS, bukan MSI: `installMode: basicUi`
 * di config berarti updater menjalankan setup.exe diam-diam. Menunjuk ke MSI
 * akan membuka dialog pemasangan MSI dan terasa seperti aplikasi yang hang.
 */
const nsis = join(bundle, 'nsis');
if (!existsSync(nsis)) {
  console.error(`Folder NSIS tidak ada: ${nsis}`);
  process.exit(1);
}

const setup = readdirSync(nsis).find((f) => f.endsWith('-setup.exe'));
if (!setup) {
  console.error('Tidak menemukan *-setup.exe di folder NSIS:');
  console.error(readdirSync(nsis).join('\n'));
  process.exit(1);
}

const sigPath = join(nsis, `${setup}.sig`);
if (!existsSync(sigPath)) {
  console.error(`Berkas tanda tangan tidak ada: ${sigPath}`);
  console.error('Build tanpa kunci minisign menghasilkan installer yang tidak bisa dipakai');
  console.error('updater. Periksa TAURI_SIGNING_PRIVATE_KEY dan passwordnya.');
  process.exit(1);
}

const signature = readFileSync(sigPath, 'utf8').trim();

/* Nama berkas di URL harus PERSIS sama dengan yang diunggah. */
const url = `${repo}/v${versi}/${setup}`;

const catatan = existsSync(join(dir, 'RELEASE_NOTES.md'))
  ? readFileSync(join(dir, 'RELEASE_NOTES.md'), 'utf8').slice(0, 2000)
  : `Zephyr ${versi}`;

const manifes = {
  version: versi,
  notes: catatan,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms: {
    'windows-x86_64': { signature, url },
  },
};

writeFileSync(join(dir, 'latest.json'), JSON.stringify(manifes, null, 2) + '\n', { encoding: 'utf8' });

console.log(`latest.json ditulis untuk ${versi}`);
console.log(`  installer : ${setup}`);
console.log(`  signature : ${signature.slice(0, 40)}... (${signature.length} karakter)`);
console.log(`  url       : ${url}`);
