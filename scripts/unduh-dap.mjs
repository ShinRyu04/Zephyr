// unduh-dap.mjs — unduh debug adapter ke %APPDATA%\zephyr\dap.
//
// JALUR PRODUK, bukan helper harness: brief fase 22 minta adapter node &
// python, dan seperti ripgrep di fase 25 kita TIDAK membundel binary pihak
// ketiga. Adapter diunduh on-demand ke folder data user.
//
// Yang diunduh: js-debug-dap (Microsoft, adapter resmi untuk Node.js).
// Asetnya `js-debug-dap-vX.tar.gz` berisi folder `js-debug/` dengan
// `src/dapDebugServer.js` — sebuah server DAP yang mendengar di TCP port.
//
// debugpy TIDAK diunduh di sini: ia paket Python yang harus masuk ke
// interpreter user (`pip install debugpy`), bukan file lepas. dap.rs
// mendeteksinya dan memberi pesan install yang jelas kalau belum ada.

import { mkdirSync, existsSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const DAP = join(process.env.APPDATA, 'zephyr', 'dap');
const TUJUAN = join(DAP, 'js-debug');
const ENTRY = join(TUJUAN, 'src', 'dapDebugServer.js');

// tar bawaan Windows (bsdtar), BUKAN `tar` dari PATH — di mesin ini `tar`
// pertama adalah GNU tar dari MSYS yang tidak bisa membaca semua arsip.
const TAR = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

const main = async () => {
  if (existsSync(ENTRY)) {
    console.log('sudah ada:', ENTRY);
    return;
  }
  mkdirSync(DAP, { recursive: true });

  const rel = await fetch(
    'https://api.github.com/repos/microsoft/vscode-js-debug/releases/latest',
    { headers: { 'user-agent': 'zephyr-editor' } },
  ).then((r) => r.json());

  const aset = rel.assets.find((a) => /^js-debug-dap-v.*\.tar\.gz$/.test(a.name));
  if (!aset) throw new Error('aset js-debug-dap tidak ditemukan di rilis terbaru');
  console.log('unduh', aset.name, (aset.size / 1048576).toFixed(1) + 'MB');

  const buf = Buffer.from(
    await fetch(aset.browser_download_url, { headers: { 'user-agent': 'zephyr-editor' } }).then(
      (r) => r.arrayBuffer(),
    ),
  );
  const arsip = join(DAP, aset.name);
  writeFileSync(arsip, buf);

  // Dijalankan DARI folder tujuan dengan nama relatif: bsdtar menolak path
  // absolut berdrive di -f ("Cannot connect to C: resolve failed" — C:
  // dianggap host remote).
  const r = spawnSync(TAR, ['-xzf', aset.name], { cwd: DAP, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tar gagal: ${r.stderr || r.stdout}`);
  rmSync(arsip, { force: true });

  if (!existsSync(ENTRY)) {
    throw new Error(`entry tidak ada setelah ekstrak; isi: ${readdirSync(DAP).join(', ')}`);
  }
  console.log('siap:', ENTRY);
  const v = spawnSync(process.execPath, [ENTRY, '--help'], { encoding: 'utf8', timeout: 8000 });
  console.log('cek:', (v.stdout || v.stderr || '').split('\n')[0].slice(0, 120));
};

main().catch((e) => {
  console.error('gagal:', e.message);
  process.exit(1);
});
