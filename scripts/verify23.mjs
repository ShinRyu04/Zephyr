// verify23.mjs — verifikasi fase 23 (Tasks: tasks.json, Run Task, matchers).
//
// Pakai:  node scripts/verify23.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev`,
//         dan workspace app HARUS D:\Zephyr (fixture ada di .zephyr/tasks.json).
//
// Peta V → brief fase 23:
//   V1  tsc --noEmit 0 error + cargo test --lib lulus
//   V2  tasks.json terbaca (JSONC + skema); Run Build Task jalan; output masuk
//       channel Output "Task:<label>"; error TS jadi entri Problems dengan
//       file:line yang benar-benar bisa dibuka
//   V3  dependsOn berantai jalan URUT; watch isBackground terdeteksi siap
//   V4  task yang listen port → entri Ports (fase 20) muncul otomatis
//   V5  Terminate → proses mati bersih (port benar-benar lepas)
//
// CATATAN HARNESS:
//  * Fixture `.zephyr/tasks.json` + `scripts/uji23/*` memang DI DALAM repo —
//    beda dengan verify19. Alasannya: `tasks_load` mencari relatif terhadap
//    workspace, jadi fixture harus berada di workspace yang sedang dibuka.
//    `.zephyr/` dan `scripts/uji23/` masuk .gitignore.
//  * Menulis fixture DI SINI tetap dihindari saat app sudah jalan: file
//    dibuat SEBELUM harness attach (lewat buat-fixture23.mjs), dan
//    `.zephyr/` di luar `src/` sehingga tidak memicu Vite HMR full reload.
//  * prelude lib-cdp.mjs sudah menyediakan S, s, q, qa, wait, TS, TK — jangan
//    deklarasi ulang.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagian1 } from './v23/bagian1.mjs';
import { bagian2 } from './v23/bagian2.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify23');

/** Port server uji (8080 haram di mesin ini — WinError 10013). */
export const PORT_UJI = 8123;

const main = async () => {
  // Fixture harus sudah ada sebelum app membaca tasks.json.
  if (!existsSync('D:/Zephyr/.zephyr/tasks.json')) {
    spawnSync(process.execPath, ['scripts/uji23/buat-fixture23.mjs'], {
      cwd: 'D:/Zephyr',
      stdio: 'inherit',
    });
  }

  // ═════════ V1: tsc + cargo ═════════
  // tsc dipanggil lewat process.execPath, BUKAN npx.cmd — spawnSync('npx.cmd')
  // mengembalikan status null di MSYS/git-bash (pelajaran fase 12).
  const tsc = spawnSync(
    process.execPath,
    ['node_modules/typescript/lib/tsc.js', '--noEmit'],
    { cwd: 'D:/Zephyr', encoding: 'utf8' },
  );
  const cargo = spawnSync('cargo', ['test', '--lib'], {
    cwd: 'D:/Zephyr/src-tauri',
    encoding: 'utf8',
  });
  const cargoOut = `${cargo.stdout ?? ''}${cargo.stderr ?? ''}`;
  const cargoOk = /test result: ok\./.test(cargoOut) && cargo.status === 0;
  const jmlUji = (cargoOut.match(/(\d+) passed/) ?? [])[1] ?? '?';
  const ujiTasks = (cargoOut.match(/^test tasks::/gm) ?? []).length;

  check(
    'V1',
    tsc.status === 0 && cargoOk,
    `tsc --noEmit exit ${tsc.status}; cargo test --lib exit ${cargo.status} ` +
      `(${jmlUji} uji lulus, ${ujiTasks} di antaranya milik tasks.rs)` +
      (tsc.status !== 0
        ? `\n${(tsc.stdout || '').split('\n').slice(0, 6).join('\n')}`
        : ''),
  );

  const { cdp } = await Cdp.attach(CDP_PORT);

  // Keadaan awal yang bisa diprediksi: tutup tab, sembunyikan panel terminal
  // yang di-maximize (bikin .editor-area display:none → semua uji ukuran gagal),
  // bersihkan Problems/Ports/notifikasi dari uji sebelumnya.
  await cdp.runAsync(
    `
    // Workspace WAJIB dibuka dulu: tasks_load mencari .zephyr/tasks.json relatif
    // terhadap workspace, dan app yang baru start belum punya workspace sama
    // sekali (workspace: null) → "belum ada workspace". Pelajaran yang sama
    // dengan verify12 yang harus openWorkspace ke repo git lebih dulu.
    if (S.getState().workspace !== 'D:/Zephyr') {
      await S.getState().openWorkspace('D:/Zephyr');
      await wait(1500);
    }
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setSettingsOpen(false);
    S.getState().setFindOpen(false);
    if (TS().maximized || TS().visible) TS().setVisible(false);
    TK.hapusPorts();
    await TK.hentikanSemua();
    window.__ZEPHYR_NOTIF__.clear();
    return JSON.stringify({ workspace: S.getState().workspace });
  `,
    90000,
  );

  await bagian1(cdp, check, { PORT_UJI });
  await bagian2(cdp, check, { PORT_UJI });

  // Kembalikan keadaan.
  await cdp.runAsync(
    `
    await TK.hentikanSemua();
    TK.hapusPorts();
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setActivity('explorer');
    window.__ZEPHYR_NOTIF__.clear();
    return 'beres';
  `,
    60000,
  );

  await cdp.close();
  selesai();
};

main().catch((e) => {
  console.error('verify23 error:', e.message);
  process.exit(1);
});
