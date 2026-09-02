// verify15.mjs — verifikasi fase 15 (Bugfix Vol 1) di app HIDUP lewat CDP.
//
// Pakai:  node scripts/verify15.mjs [portCdp]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup di :5173
//
// Prinsip: tidak ada yang "dianggap lulus". Tiap V memanggil jalur yang sama
// dengan yang dipakai user (store/command Rust asli), lalu membaca DOM/state
// nyata atau file di disk sebagai bukti.
//
// Peta V → item BUGLOG:
//   V1  UTF-16 BOM terbaca (#1)                     V6  git diff biner (#11)
//   V2  file >4MB read-only ringan (#2, #6)         V7  branch slash + push behind (#12,#13)
//   V3  Ctrl+S file hilang (#3)                     V8  MCP batas + stop (#14,#15,#16)
//   V4  find regex step limit (#4, #5)              V9  AI potong 8KB (#17)
//   V5  paste 4KB + exit code + 6 pane (#7,#8,#9)  V10 UI sempit + RAM (#19,#20)
//   V11 tsc 0 + cargo test + 0 console error

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter, rpc, sleep } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify15');

// ───────────────────────── sandbox di disk ─────────────────────────

const BASE = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'Temp',
  `zephyr-p15-${process.pid}`,
);
const WS = path.join(BASE, 'ws');

const git = (args, cwd = WS) =>
  spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });

/** Repo uji + remote lokal (bare) supaya push/behind bisa diuji nyata. */
function siapkanSandbox() {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });

  // 1) file UTF-16LE dengan BOM — dibuat dari Node supaya byte-nya pasti.
  const teksU16 = 'halo dari UTF-16\nbaris kedua\n';
  const bufU16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(teksU16, 'utf16le'),
  ]);
  fs.writeFileSync(path.join(WS, 'utf16.txt'), bufU16);

  // 2) JSON ~5MB untuk uji mode ringan (>4MB).
  //    CATATAN: JANGAN memakai `baris.join('\n').length` di kondisi while —
  //    itu O(n²) dan butuh >10 menit untuk 90.000 baris (sudah kena sekali,
  //    harness terlihat "menggantung" padahal cuma sibuk menyambung string).
  //    Hitung panjang secara inkremental.
  const baris = [];
  let panjang = 0;
  let n = 0;
  while (panjang < 5 * 1024 * 1024) {
    const b = `  { "id": ${n}, "nama": "item-${n}", "nilai": ${n * 3} },`;
    baris.push(b);
    panjang += b.length + 1;
    n++;
  }
  fs.writeFileSync(path.join(WS, 'besar.json'), `[\n${baris.join('\n')}\n]\n`);

  // 3) file kecil untuk uji "hilang lalu Ctrl+S".
  fs.writeFileSync(path.join(WS, 'akan-hilang.txt'), 'isi awal\n');

  // 4) file untuk uji find regex (banyak 'a').
  fs.writeFileSync(path.join(WS, 'banyak-a.txt'), 'a'.repeat(60000));

  // 5) PNG kecil (header PNG asli + byte NUL) untuk uji diff biner.
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(2048, 0),
  ]);

  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Zephyr Uji']);
  git(['config', 'user.email', 'uji@zephyr.local']);
  fs.writeFileSync(path.join(WS, 'gambar.png'), png);
  fs.writeFileSync(path.join(WS, 'kode.txt'), 'satu\ndua\n');
  git(['add', 'gambar.png', 'kode.txt']);
  git(['commit', '-m', 'awal']);

  // Remote bare + satu commit yang HANYA ada di remote → lokal jadi behind.
  // `-b main` WAJIB di init --bare dan di clone: tanpa itu HEAD remote menunjuk
  // master, klon gagal checkout, dan branch.ab tetap +0 -0 (behind 0) sehingga
  // uji "push saat behind" tidak pernah terpicu.
  const REMOTE = path.join(BASE, 'remote.git');
  git(['init', '--bare', '-b', 'main', REMOTE], BASE);
  git(['remote', 'add', 'origin', REMOTE]);
  git(['push', '-u', 'origin', 'main']);

  const KLON = path.join(BASE, 'klon');
  git(['clone', '-b', 'main', REMOTE, KLON], BASE);
  git(['config', 'user.name', 'Orang Lain'], KLON);
  git(['config', 'user.email', 'lain@zephyr.local'], KLON);
  fs.writeFileSync(path.join(KLON, 'dari-remote.txt'), 'commit orang lain\n');
  git(['add', '.'], KLON);
  git(['commit', '-m', 'commit dari remote'], KLON);
  git(['push', 'origin', 'main'], KLON);
  // Fetch dari sisi WS supaya branch.ab sudah -1 sebelum harness mulai.
  git(['fetch', 'origin']);

  // Ubah PNG di worktree supaya `git diff gambar.png` menghasilkan diff biner.
  fs.writeFileSync(
    path.join(WS, 'gambar.png'),
    Buffer.concat([png, Buffer.from([0x00, 0x01, 0x02, 0x03])]),
  );

  return { REMOTE, KLON };
}

// ───────────────────────── util host ─────────────────────────

const appdata = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');

/** Ukuran file di disk (0 kalau tidak ada). */
const ukuran = (p) => (fs.existsSync(p) ? fs.statSync(p).size : 0);

/** Baca byte pertama file sebagai hex (untuk membuktikan BOM/encoding). */
const bomHex = (p, n = 2) =>
  fs.existsSync(p) ? fs.readFileSync(p).subarray(0, n).toString('hex') : '';

export { BASE, WS, git, siapkanSandbox, appdata, ukuran, bomHex, CDP_PORT, check, selesai };
export { Cdp, rpc, sleep, fs, os, path, spawnSync };
