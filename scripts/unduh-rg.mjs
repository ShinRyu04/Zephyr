// unduh-rg.mjs — unduh binary ripgrep ke %APPDATA%\zephyr\bin.
//
// Ini JALUR PRODUK, bukan sekadar helper harness: brief fase 25 meminta rg
// diambil dari PATH ATAU diunduh on-demand ke %APPDATA%\zephyr\bin, dan
// TIDAK dibundel ke installer. Skrip ini adalah implementasi "unduh
// on-demand" itu, dipakai juga oleh tombol di Settings.
//
// Sengaja memakai release resmi GitHub BurntSushi/ripgrep (bukan mirror):
// checksum bisa diverifikasi dan versinya jelas.

import { mkdirSync, existsSync, createWriteStream, rmSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const VERSI = '14.1.1';
const APPDATA = process.env.APPDATA || join(process.env.USERPROFILE ?? '.', 'AppData/Roaming');
const BIN = join(APPDATA, 'zephyr', 'bin');
const TARGET = join(BIN, 'rg.exe');

const NAMA = `ripgrep-${VERSI}-x86_64-pc-windows-msvc`;
const URL = `https://github.com/BurntSushi/ripgrep/releases/download/${VERSI}/${NAMA}.zip`;

const main = async () => {
  if (existsSync(TARGET)) {
    const v = spawnSync(TARGET, ['--version'], { encoding: 'utf8' });
    console.log(`rg sudah ada: ${TARGET}`);
    console.log((v.stdout || '').split('\n')[0]);
    return;
  }
  mkdirSync(BIN, { recursive: true });

  const tmp = join(BIN, `${NAMA}.zip`);
  console.log(`unduh ${URL}`);
  const res = await fetch(URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  await pipeline(res.body, createWriteStream(tmp));
  console.log(`terunduh ${(statSync(tmp).size / 1048576).toFixed(1)} MB`);

  // Ekstrak: pakai bsdtar BAWAAN WINDOWS di System32, bukan `tar` dari PATH.
  //
  // Dua jebakan yang sudah kena:
  //  1. `tar` pertama di PATH pada mesin ini adalah GNU tar dari MSYS/git-bash,
  //     dan GNU tar TIDAK bisa membaca zip ("This does not look like a tar
  //     archive"). Yang bisa hanya bsdtar bawaan Windows 10+.
  //  2. bsdtar menolak path absolut berdrive sebagai argumen -f ("Cannot
  //     connect to C: resolve failed" — "C:" dianggap host remote), jadi ia
  //     dijalankan DARI folder tujuan dengan nama file relatif.
  const keluar = join(BIN, '_x');
  rmSync(keluar, { recursive: true, force: true });
  mkdirSync(keluar, { recursive: true });
  const bsdtar = join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe');
  const ex = spawnSync(existsSync(bsdtar) ? bsdtar : 'tar', ['-xf', `${NAMA}.zip`, '-C', '_x'], {
    cwd: BIN,
    encoding: 'utf8',
  });
  if (ex.status !== 0) throw new Error(`ekstrak gagal: ${ex.stderr || ex.stdout}`);

  // Cari rg.exe di dalam hasil ekstrak (ada satu level folder).
  const cari = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        const k = cari(p);
        if (k) return k;
      } else if (e.name.toLowerCase() === 'rg.exe') {
        return p;
      }
    }
    return null;
  };
  const asal = cari(keluar);
  if (!asal) throw new Error('rg.exe tidak ditemukan di dalam arsip');
  renameSync(asal, TARGET);
  rmSync(keluar, { recursive: true, force: true });
  rmSync(tmp, { force: true });

  const v = spawnSync(TARGET, ['--version'], { encoding: 'utf8' });
  if (v.status !== 0) throw new Error(`rg tidak bisa dijalankan: ${v.stderr}`);
  console.log(`OK ${TARGET}`);
  console.log((v.stdout || '').split('\n')[0]);
};

main().catch((e) => {
  console.error('unduh-rg gagal:', e.message);
  process.exit(1);
});
