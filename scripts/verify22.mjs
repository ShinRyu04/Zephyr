// verify22.mjs — verifikasi fase 22 (Debugger DAP / Run & Debug).
//
// Pakai:  node scripts/verify22.mjs [portCdp]
// Syarat: zephyr.exe --remote-debugging-port=9223 + `npm run dev`,
//         workspace app = D:\Zephyr, adapter js-debug sudah diunduh
//         (`node scripts/unduh-dap.mjs`).
//
// Peta V → brief fase 22:
//   V1 tsc --noEmit 0 error + cargo test --lib lulus
//   V2 launch.json node → F5 start, breakpoint kena, call stack & variables
//      terisi, StepOver/In/Out benar
//   V3 Debug Console REPL: ekspresi dievaluasi dari sesi (bukan no-op lagi)
//   V4 Stop → adapter & program mati; tidak ada proses tersisa
//   V5 Python (debugpy) — kalau tidak ada, pesan install jelas & tidak crash
//   V6 launch.json JSONC + entri rusak ditolak dengan alasan (bukan didiamkan)
//   V7 UI: gutter breakpoint, highlight baris aktif, toolbar, context key
//
// CATATAN HARNESS (mahal dipelajari, jangan diulang):
//  * js-debug memakai DUA SESI. `dap_start` selesai setelah `launch` dibalas,
//    TAPI sesi anak (yang memegang debuggee) dibuat ASINKRON sesudah reverse
//    request `startDebugging`. Karena itu harness menunggu event `stopped`
//    dengan polling, bukan menganggap start = siap.
//  * threadId 0 adalah id yang SAH di js-debug — jangan pakai `|| null`.
//  * Fixture di `.zephyr/uji22/` + `.zephyr/launch.json` (dap_load hanya
//    mencari di `.zephyr/` atau `.vscode/`, bukan subfolder).
//  * prelude lib-cdp.mjs menyediakan S, q, qa, wait, TS, DBG — jangan
//    deklarasi ulang.

import { rmSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagian1 } from './v22/bagian1.mjs';
import { bagian2 } from './v22/bagian2.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify22');

export const F = {
  dir: 'D:/Zephyr/.zephyr/uji22',
  program: 'D:/Zephyr/.zephyr/uji22/program.js',
  lempar: 'D:/Zephyr/.zephyr/uji22/lempar.js',
  launch: 'D:/Zephyr/.zephyr/launch.json',
};

const siapkanFixture = () => {
  const r = spawnSync(process.execPath, ['scripts/uji22/buat-fixture22.mjs'], {
    cwd: 'D:/Zephyr',
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`fixture22 gagal: ${r.stderr || r.stdout}`);
  }
};

const bersihkanFixture = () => {
  try {
    if (existsSync(F.dir)) rmSync(F.dir, { recursive: true, force: true });
    if (existsSync(F.launch)) rmSync(F.launch, { force: true });
  } catch {
    /* biar saja */
  }
};

/** Hitung proses node yang jalan — dasar bukti V4 (tidak ada sisa proses). */
export const hitungNode = () => {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-Process node -ErrorAction SilentlyContinue).Count'], {
    encoding: 'utf8',
  });
  return Number((r.stdout || '0').trim()) || 0;
};

const main = async () => {
  bersihkanFixture();
  siapkanFixture();

  // ═════════ V1: tsc + cargo ═════════
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: 'D:/Zephyr',
    encoding: 'utf8',
  });
  const cargo = spawnSync('cargo', ['test', '--lib'], {
    cwd: 'D:/Zephyr/src-tauri',
    encoding: 'utf8',
  });
  const cargoOut = `${cargo.stdout ?? ''}${cargo.stderr ?? ''}`;
  const cargoOk = /test result: ok\./.test(cargoOut) && cargo.status === 0;
  const jml = (cargoOut.match(/(\d+) passed/) ?? [])[1] ?? '?';
  const ujiDap = (cargoOut.match(/^test dap::/gm) ?? []).length;

  check(
    'V1',
    tsc.status === 0 && cargoOk,
    `tsc --noEmit exit ${tsc.status}; cargo test --lib exit ${cargo.status} ` +
      `(${jml} uji lulus, ${ujiDap} milik dap.rs)` +
      (tsc.status !== 0 ? `\n${(tsc.stdout || '').split('\n').slice(0, 6).join('\n')}` : ''),
  );

  const { cdp } = await Cdp.attach(CDP_PORT);

  // Keadaan awal yang bisa diprediksi.
  await cdp.runAsync(
    `
    if (S.getState().workspace !== 'D:/Zephyr') {
      await S.getState().openWorkspace('D:/Zephyr');
      await wait(1500);
    }
    // Sesi debug sisa uji sebelumnya WAJIB dimatikan: satu sesi aktif saja.
    await DBG.stop().catch(() => {});
    await DBG.hapusSemuaBreakpoint().catch(() => {});
    DBG.bersihkanRepl();
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setSettingsOpen(false);
    S.getState().setFindOpen(false);
    // Panel bawah yang di-maximize membuat .editor-area display:none (fase 13).
    if (TS().maximized || TS().visible) TS().setVisible(false);
    S.getState().setActivity('debug');
    if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
    await wait(500);
    window.__ZEPHYR_NOTIF__.clear();
    await DBG.muatLaunch();
    await DBG.muatAdapters();
    return JSON.stringify({ workspace: S.getState().workspace });
  `,
    90000,
  );

  await bagian1(cdp, check, F);
  await bagian2(cdp, check, F, { hitungNode });

  // Kembalikan keadaan.
  await cdp.runAsync(
    `
    await DBG.stop().catch(() => {});
    await DBG.hapusSemuaBreakpoint().catch(() => {});
    DBG.bersihkanRepl();
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setActivity('explorer');
    window.__ZEPHYR_NOTIF__.clear();
    return 'beres';
  `,
    60000,
  );

  await cdp.close();
  bersihkanFixture();
  selesai();
};

main().catch((e) => {
  console.error('verify22 error:', e.message);
  bersihkanFixture();
  process.exit(1);
});
