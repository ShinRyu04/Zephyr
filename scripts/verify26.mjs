// verify26.mjs — verifikasi fase 26 (Local History / Timeline).
//
// Pakai:  node scripts/verify26.mjs [portCdp]
// Syarat: zephyr.exe --remote-debugging-port=9223 + `npm run dev`,
//         workspace app = D:\Zephyr.
//
// Peta V → brief fase 26:
//   V1  tsc --noEmit 0 error + cargo test --lib lulus
//   V2  Edit+save 3x → 3 snapshot; Timeline menampilkan snapshot + commit git
//   V3  Diff snapshot vs current benar (kiri=riwayat, kanan=kini);
//       Restore mengisi editor dan menandainya DIRTY tanpa menulis disk
//   V4  Retention: maxPerFile kecil → snapshot lama terhapus; dedup isi sama
//   V5  File besar / biner TIDAK di-snapshot
//
// CATATAN HARNESS:
//  * Fixture ditulis di `.zephyr/uji26/` — DI DALAM workspace (history hanya
//    untuk file di dalam workspace, itu batas keamanannya) tapi di LUAR `src/`
//    supaya Vite HMR tidak melakukan full reload dan membuang window[slot]
//    milik runAsync (pelajaran fase 24).
//  * `.zephyr/` sudah masuk .gitignore sejak fase 23.
//  * prelude lib-cdp.mjs menyediakan S, q, qa, wait, TS, HS — jangan
//    deklarasi ulang.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagian1 } from './v26/bagian1.mjs';
import { bagian2 } from './v26/bagian2.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify26');

const DIR = 'D:/Zephyr/.zephyr/uji26';
export const FILE_UJI = `${DIR}/catatan.txt`;
export const FILE_BESAR = `${DIR}/besar.txt`;
export const FILE_BINER = `${DIR}/gambar.bin`;

const siapkanFixture = () => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE_UJI, 'versi awal\nbaris dua\n', 'utf8');

  // > 5MB supaya melewati BATAS_BYTE di history.rs.
  writeFileSync(FILE_BESAR, 'x'.repeat(5 * 1024 * 1024 + 1024), 'utf8');

  // Byte NUL di awal = biner menurut `tampak_biner`.
  const biner = Buffer.alloc(4096);
  biner.write('PK\u0003\u0004', 0, 'binary');
  writeFileSync(FILE_BINER, biner);
};

const bersihkanFixture = () => {
  try {
    if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* biar saja */
  }
};

const main = async () => {
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
  const ujiHist = (cargoOut.match(/^test history::/gm) ?? []).length;

  check(
    'V1',
    tsc.status === 0 && cargoOk,
    `tsc --noEmit exit ${tsc.status}; cargo test --lib exit ${cargo.status} ` +
      `(${jml} uji lulus, ${ujiHist} milik history.rs)` +
      (tsc.status !== 0 ? `\n${(tsc.stdout || '').split('\n').slice(0, 6).join('\n')}` : ''),
  );

  const { cdp } = await Cdp.attach(CDP_PORT);

  // Keadaan awal yang bisa diprediksi.
  await cdp.runAsync(
    `
    // Workspace WAJIB dibuka: history hanya untuk file DI DALAM workspace,
    // dan app yang baru start punya workspace null.
    if (S.getState().workspace !== 'D:/Zephyr') {
      await S.getState().openWorkspace('D:/Zephyr');
      await wait(1500);
    }
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setSettingsOpen(false);
    S.getState().setFindOpen(false);
    if (TS().maximized || TS().visible) TS().setVisible(false);
    S.getState().setActivity('explorer');
    if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
    // Kembalikan setting history ke default sebelum diuji.
    await S.getState().applySettings({
      history: { enabled: true, maxPerFile: 50, maxDays: 30 },
    });
    HS.tutupDiff();
    window.__ZEPHYR_NOTIF__.clear();
    return JSON.stringify({ workspace: S.getState().workspace });
  `,
    90000,
  );

  await bagian1(cdp, check, { FILE_UJI });
  await bagian2(cdp, check, { FILE_UJI, FILE_BESAR, FILE_BINER });

  // Kembalikan keadaan.
  await cdp.runAsync(
    `
    HS.tutupDiff();
    await HS.clear(${JSON.stringify(FILE_UJI)}).catch(() => {});
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await S.getState().applySettings({
      history: { enabled: true, maxPerFile: 50, maxDays: 30 },
    });
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
  console.error('verify26 error:', e.message);
  bersihkanFixture();
  process.exit(1);
});
