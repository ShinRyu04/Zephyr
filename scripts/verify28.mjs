// verify28.mjs — verifikasi fase 28 (CLI launcher `zephyr` + single instance).
//
// Pakai:  node scripts/verify28.mjs [portCdp]
// Syarat: zephyr.exe --remote-debugging-port=9223 + `npm run dev`.
//
// V1 --version & --help benar + banner (berwarna di TTY, plain saat di-pipe);
//    `zephyr .` senyap (stdout bersih tanpa banner)
// V2 `zephyr <folder>` → workspace terbuka
// V3 `zephyr file.ts:10:5` → tab terbuka & kursor di 10:5
// V4 `zephyr --diff a b` → DiffViewer terisi
// V5 instance kedua meneruskan argv ke jendela pertama (tanpa jendela baru)
// V6 `--wait` menahan shell sampai file ditutup
//
// PERINGATAN PERMANEN: JANGAN pakai backtick di dalam komentar yang berada di
// dalam template literal — template tertutup lebih awal dan `node --check`
// tetap lolos. Sudah kena 4 kali (verify26, verify25, fixture22, verify22).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Cdp } from './lib-cdp.mjs';
import { bagian1 } from './v28/bagian1.mjs';
import { bagian2 } from './v28/bagian2.mjs';

const PORT = process.argv[2] || '9223';
const AKAR = path.resolve(import.meta.dirname, '..');
const EXE = path.join(AKAR, 'src-tauri', 'target', 'debug', 'zephyr.exe');

const F = {
  dir: 'D:/Zephyr/.zephyr/uji28',
  target: 'D:/Zephyr/.zephyr/uji28/target28.ts',
  diffA: 'D:/Zephyr/.zephyr/uji28/diff-a.txt',
  diffB: 'D:/Zephyr/.zephyr/uji28/diff-b.txt',
  ws: 'D:/Zephyr/.zephyr/uji28/sebagai-workspace',
  commitMsg: 'D:/Zephyr/.zephyr/uji28/COMMIT_EDITMSG',
};

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok: !!ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

/** Jalankan exe langsung dengan argumen, tangkap stdout (jalur pipe). */
function jalankanExe(args, opts = {}) {
  return spawnSync(EXE, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: opts.timeout || 20000,
    cwd: opts.cwd || AKAR,
    env: opts.env || process.env,
  });
}

async function main() {
  // Fixture selalu dibuat ulang: uji sebelumnya bisa mengubah isi file.
  const fx = spawnSync(process.execPath, [path.join(AKAR, 'scripts/uji28/buat-fixture28.mjs')], {
    encoding: 'utf8',
  });
  if (fx.status !== 0) {
    console.error(`fixture gagal: ${fx.stderr || fx.stdout}`);
    process.exit(1);
  }

  // ═══════════════ V1: banner & stdout senyap (tanpa CDP) ═══════════════
  //
  // Dijalankan lewat spawnSync = stdout DI-PIPE, jadi ini sekaligus menguji
  // jalur "bukan TTY": output harus plain tanpa ANSI.
  const v = jalankanExe(['--version']);
  const h = jalankanExe(['--help']);
  const senyap = jalankanExe(['.'], { cwd: F.dir.replace(/\//g, '\\') });

  const versiPlain = (v.stdout || '').trim();
  const helpOut = h.stdout || '';
  const adaAnsi = (s) => s.includes('\u001b[');

  const v1ok =
    /^zephyr \d+\.\d+\.\d+$/.test(versiPlain) &&
    !adaAnsi(versiPlain) &&
    helpOut.includes('Pakai: zephyr') &&
    helpOut.includes('--diff') &&
    helpOut.includes('--wait') &&
    helpOut.includes('core.editor') &&
    !adaAnsi(helpOut) &&
    // `zephyr .` WAJIB senyap: tidak ada banner, tidak ada teks apa pun.
    (senyap.stdout || '').trim() === '' &&
    !(senyap.stdout || '').includes('Zephyr v');

  check(
    'F28-V1',
    v1ok,
    `--version pipe: "${versiPlain}" (ansi ${adaAnsi(versiPlain)}); ` +
      `--help ${helpOut.split('\n').length} baris, memuat opsi ${helpOut.includes('--diff')}; ` +
      `"zephyr ." stdout ${JSON.stringify((senyap.stdout || '').slice(0, 40))}`,
  );

  // Bukti banner BERWARNA lewat jalur TTY diambil dari Rust langsung (V1b di
  // bagian1 lewat cli_teks warna:true) — proses anak di harness selalu pipe,
  // jadi mustahil membuktikan TTY dari sini tanpa mengarang.

  const { cdp } = await Cdp.attach(PORT);
  await bagian1(cdp, check, F, { jalankanExe, EXE, AKAR });
  await bagian2(cdp, check, F, { jalankanExe, EXE, AKAR, fs });

  const lulus = hasil.filter((x) => x.ok).length;
  console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
  process.exit(lulus === hasil.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
