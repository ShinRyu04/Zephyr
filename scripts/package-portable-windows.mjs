// Package the already-built Windows RELEASE executable. This script never reads
// from target/debug and never runs a build.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const cargo = readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
const tauri = JSON.parse(readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
const version = pkg.version;

for (const [name, value] of [
  ['package.json', pkg.version],
  ['src-tauri/Cargo.toml', cargoVersion],
  ['src-tauri/tauri.conf.json', tauri.version],
]) {
  if (value !== version) throw new Error(`Versi ${name} (${value ?? 'tidak ada'}) bukan ${version}`);
}

if (process.platform !== 'win32') throw new Error('Paket portable Windows hanya dapat dibuat di Windows');

const releaseExe = path.join(root, 'src-tauri', 'target', 'release', 'zephyr.exe');
if (!existsSync(releaseExe) || !statSync(releaseExe).isFile()) {
  throw new Error(`Exe RELEASE tidak ada: ${releaseExe}. Jalankan build release lebih dulu.`);
}

// The CLI is a GUI-subsystem executable, so its stdout is not reliably captured
// by every Windows shell. PE ProductVersion is deterministic and set by Tauri.
const versionProbe = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', '(Get-Item -LiteralPath $env:ZEPHYR_RELEASE_EXE).VersionInfo.ProductVersion'],
  {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ZEPHYR_RELEASE_EXE: releaseExe },
  },
);
if (versionProbe.status !== 0) {
  throw new Error(`Tidak dapat membaca versi exe release: ${(versionProbe.stderr || '').trim()}`);
}
const exeVersion = (versionProbe.stdout || '').trim();
if (exeVersion !== version) {
  throw new Error(`Versi exe release ${exeVersion || '(kosong)'} bukan versi kanonis ${version}`);
}

const portableRoot = path.join(root, 'release', version, 'portable');
const packageName = `Zephyr_${version}_windows_portable`;
const packageDir = path.join(portableRoot, packageName);
const zipPath = path.join(portableRoot, `${packageName}.zip`);

console.log(`release exe : ${releaseExe}`);
console.log(`version     : ${version}`);
console.log(`output      : ${packageDir}`);
if (process.argv.includes('--check')) {
  console.log('check only: sumber release dan versi valid; tidak ada file ditulis');
  process.exit(0);
}

/*
 * Never carry state into a published zip.
 *
 * A previous run leaves settings, trust and recent-file JSON in data/, and
 * mcp.json holds the live MCP bearer token. Zipping the directory wholesale
 * published those. Remove the package dir first, then abort if anything
 * survived (a running zephyr.exe holds data/ open and defeats rmSync), and
 * allow only the three files this job actually writes into the archive.
 */
const BOLEH_DI_ZIP = new Set(['zephyr.exe', 'portable', 'PORTABLE-README.txt']);

rmSync(packageDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
if (existsSync(packageDir)) {
  throw new Error(
    `Tidak bisa membersihkan ${packageDir}. Tutup Zephyr portable yang sedang jalan lalu ulangi, ` +
      'kalau tidak data/ lama (termasuk token MCP) ikut ke zip.',
  );
}
mkdirSync(path.join(packageDir, 'data'), { recursive: true });
copyFileSync(releaseExe, path.join(packageDir, 'zephyr.exe'));
writeFileSync(path.join(packageDir, 'portable'), '');
writeFileSync(
  path.join(packageDir, 'PORTABLE-README.txt'),
  [
    `Zephyr ${version} portable for Windows`,
    '',
    'Keep the zero-byte file named "portable" next to zephyr.exe.',
    'All application data is stored in the data directory next to the executable.',
    '',
    'UPDATES: this portable copy updates itself in-app. When the updater offers',
    'a new version it downloads the new zephyr.exe, verifies its SHA-256, and',
    'swaps it the moment the app exits - data/ and the "portable" marker are',
    'kept untouched. Do not accept an INSTALLER (.exe setup / .msi) update for',
    'this folder: installers only change the installed copy, never this one.',
    '',
  ].join('\r\n'),
  'utf8',
);
/* Salinan exe TUNGGAL untuk updater portable (updaterStore jalur PORTABLE):
   latest.json menyebut nama ini + sha256-nya. Ditaruh di root folder release
   — bukan di dalam zip — karena unduhannya satu berkas, bukan arsip. */
copyFileSync(releaseExe, path.join(portableRoot, `Zephyr_${version}_x64-portable.exe`));

// Compress only the allow-listed entries, not the directory: data/ must never
// reach a published zip even if something dropped files into it.
const arsip = [...BOLEH_DI_ZIP].filter((n) => existsSync(path.join(packageDir, n)));
if (!arsip.includes('zephyr.exe')) throw new Error('zephyr.exe hilang dari paket');

const zip = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Set-Location -LiteralPath $env:ZEPHYR_PORTABLE_PARENT; ' +
      '$n = $env:ZEPHYR_PORTABLE_NAME; ' +
      '$f = $env:ZEPHYR_PORTABLE_FILES -split ";"; ' +
      'Compress-Archive -Path ($f | ForEach-Object { Join-Path $n $_ }) -DestinationPath $env:ZEPHYR_PORTABLE_ZIP -CompressionLevel Optimal -Force',
  ],
  {
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      ZEPHYR_PORTABLE_PARENT: portableRoot,
      ZEPHYR_PORTABLE_NAME: packageName,
      ZEPHYR_PORTABLE_ZIP: zipPath,
      ZEPHYR_PORTABLE_FILES: arsip.join(';'),
    },
  },
);
if (zip.status !== 0 || !existsSync(zipPath)) {
  throw new Error(`Pembuatan zip gagal: ${(zip.stderr || zip.stdout || '').trim()}`);
}

console.log(`portable    : ${packageDir}`);
console.log(`zip         : ${zipPath} (${statSync(zipPath).size} bytes)`);
