// verify29.mjs — verifikasi fase 29 (multi-root workspace + Workspace Trust).
//
// Pakai:  node scripts/verify29.mjs [portCdp]
// Syarat: zephyr.exe --remote-debugging-port=9223 + `npm run dev`.
//
// V1 tsc bersih (dijalankan lewat jalur produk, bukan diasumsikan)
// V2 Dua root tampil di explorer; tree & git terdeteksi per root
// V3 .code-workspace load/save; buka ulang restore roots + settings
// V4 Workspace setting menimpa user setting (satu kunci diuji sampai folder)
// V5 Folder tak-tepercaya -> Restricted: tasks/LSP/debug/ext DITOLAK RUST +
//    banner; Trust -> aktif; keputusan persist di trust.json
//
// PERINGATAN PERMANEN: JANGAN pakai backtick di komentar yang berada DI DALAM
// template literal — template tertutup lebih awal dan `node --check` tetap
// lolos. Sudah kena 4 kali (verify26, verify25, fixture22, verify22).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Cdp } from './lib-cdp.mjs';
import { bagian1 } from './v29/bagian1.mjs';
import { bagian2 } from './v29/bagian2.mjs';

const PORT = process.argv[2] || '9223';
const AKAR = path.resolve(import.meta.dirname, '..');

const F = {
  dir: 'D:/Zephyr/.zephyr/uji29',
  rootA: 'D:/Zephyr/.zephyr/uji29/root-a',
  rootB: 'D:/Zephyr/.zephyr/uji29/root-b',
  wsFile: 'D:/Zephyr/.zephyr/uji29/uji29.code-workspace',
  wsHilang: 'D:/Zephyr/.zephyr/uji29/sebagian-hilang.code-workspace',
  wsSimpan: 'D:/Zephyr/.zephyr/uji29/root-a/hasil-simpan.code-workspace',
  trustJson: path.join(process.env.APPDATA || '', 'zephyr', 'trust.json'),
};

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok: !!ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

async function main() {
  // ── CDP dulu, fixture kemudian ──
  //
  // Urutan ini WAJIB: app memasang file watcher pada workspace aktif, dan
  // kalau workspace itu masih di dalam fixture, `rmSync` gagal dengan
  // EBUSY (rmdir). Jadi app disuruh pindah ke D:/Zephyr + lepas watcher
  // SEBELUM fixture dibangun ulang.
  const { cdp } = await Cdp.attach(PORT);
  await cdp.json(`
    WS.tanya(null);
    S.getState().setSettingsOpen(false);
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(900);
    return JSON.stringify({ ws: S.getState().workspace })
  `);

  // Fixture dibuat ulang tiap jalan: uji V4 menulis settings folder dan V5
  // mengubah trust, jadi keadaan awal harus dipastikan.
  const fx = spawnSync(process.execPath, [path.join(AKAR, 'scripts/uji29/buat-fixture29.mjs')], {
    encoding: 'utf8',
  });
  if (fx.status !== 0) {
    console.error(`fixture gagal: ${fx.stderr || fx.stdout}`);
    process.exit(1);
  }

  // trust.json dikosongkan supaya V5 benar-benar mulai dari "belum ditanya".
  // Ini file di %APPDATA%, bukan di repo — aman dihapus, dibuat ulang app.
  // CATATAN: menghapus file saja tidak cukup, karena app menyimpan keputusan
  // di disk dan membacanya per pemanggilan — V5 juga memanggil lupakanTrust()
  // lewat jalur produk untuk D:/Zephyr (trust mewarisi ke bawah).
  try {
    if (fs.existsSync(F.trustJson)) fs.rmSync(F.trustJson);
  } catch {
    /* dipegang proses lain — V5 tetap jalan, hanya keadaan awalnya beda */
  }

  // ═══════════════════ V1: tsc 0 error (jalur produk) ═══════════════════
  //
  // spawnSync('npx.cmd') mengembalikan status null di MSYS/git-bash
  // (pelajaran fase 12) — tsc dipanggil lewat process.execPath.
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: AKAR,
    encoding: 'utf8',
    timeout: 300000,
  });
  const barisError = (tsc.stdout || '')
    .split('\n')
    .filter((l) => /error TS\d+/.test(l));
  check(
    'F29-V1',
    tsc.status === 0 && barisError.length === 0,
    `tsc exit ${tsc.status}, ${barisError.length} error${
      barisError.length ? `: ${barisError[0].slice(0, 90)}` : ''
    }`,
  );

  await bagian1(cdp, check, F);
  await bagian2(cdp, check, F, { fs });

  const lulus = hasil.filter((x) => x.ok).length;
  console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
  process.exit(lulus === hasil.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
