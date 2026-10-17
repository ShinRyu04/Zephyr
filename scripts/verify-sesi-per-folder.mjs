/*
 * verify-sesi-per-folder.mjs — sesi mengikuti folder yang terbuka.
 *
 * Pakai:  node scripts/verify-sesi-per-folder.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223 dan vite di :5173.
 *
 * Bug yang dikunci di sini, dilaporkan apa adanya: "buka folder Zephyr, ganti
 * ke ZephyrDesktop, tapi sesi dari Zephyr pindah ke ZephyrDesktop". Penyebabnya
 * `activeId` tidak pernah diubah saat folder berganti, jadi percakapan yang
 * terbuka tetap milik proyek lama sementara judul jendela menyebut proyek baru.
 *
 *   S1  Membuka folder A membuat/memilih sesi yang tercap folder A.
 *   S2  Pindah ke folder B TIDAK memakai sesi folder A.
 *   S3  Sesi folder B tetap tercap folder B (tidak ikut pindah ke A).
 *   S4  Balik ke folder A memilih kembali sesi folder A.
 *   S5  Folder tanpa sesi mendapat chat baru yang tercap folder ITU, bukan
 *       folder sebelumnya.
 *   S6  Semua permukaan (`activeIds`) menunjuk sesi yang sama.
 *
 * Memakai `openWorkspace` (jalur produk), bukan menulis store langsung.
 */

import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';
import { mkdirSync } from 'node:fs';

const PORT = process.argv[2] ?? '9223';
const R = reporter('sesi-per-folder');

const A = 'C:\\Users\\Zyrex\\AppData\\Local\\Temp\\opencode\\FolderUjiA';
const B = 'C:\\Users\\Zyrex\\AppData\\Local\\Temp\\opencode\\FolderUjiB';
const C = 'C:\\Users\\Zyrex\\AppData\\Local\\Temp\\opencode\\FolderUjiC';
for (const d of [A, B, C]) mkdirSync(d, { recursive: true });

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
  (x) => x.type === 'page',
);
const t = list.find(
  (x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'),
);
if (!t) {
  R.check('S0', false, 'target app tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'for (let i = 0; i < 60; i++) {',
    '  if (typeof X !== "undefined" && X && X.store && typeof S.getState === "function") break;',
    '  await wait(500);',
    '}',
    'const AI = X.store.getState();',
    'out.siap = !!AI && typeof AI.ikutiWorkspace === "function";',
    'if (!out.siap) return out;',
    'const wsAwal = S.getState().workspace;',
    'const DIRA = ' + JSON.stringify(A) + ';',
    'const DIRB = ' + JSON.stringify(B) + ';',
    'const DIRC = ' + JSON.stringify(C) + ';',
    '',
    '/* S1: folder A. */',
    'await S.getState().openWorkspace(DIRA);',
    'await wait(2200);',
    'const idA = X.store.getState().activeId;',
    'const sesiA = () => X.store.getState().sessions.find((s) => s.id === idA) || {};',
    'out.A = { ws: S.getState().workspace, aktif: idA, sesiWs: sesiA().workspace };',
    '',
    '/* S2/S3: pindah ke B. */',
    'await S.getState().openWorkspace(DIRB);',
    'await wait(2200);',
    'const idB = X.store.getState().activeId;',
    'const sesiB = () => X.store.getState().sessions.find((s) => s.id === idB) || {};',
    'out.B = { ws: S.getState().workspace, aktif: idB, sesiWs: sesiB().workspace };',
    'out.BbedaDariA = idB !== idA;',
    '/* S3: sesi A tetap tercap A walau folder sekarang B. */',
    'out.sesiATetapA = sesiA().workspace;',
    '',
    '/* S4: balik ke A. */',
    'await S.getState().openWorkspace(DIRA);',
    'await wait(2200);',
    'out.balikA = { aktif: X.store.getState().activeId, samaDenganIdA: X.store.getState().activeId === idA };',
    '',
    '/* S5: folder C yang belum punya sesi. */',
    'await S.getState().openWorkspace(DIRC);',
    'await wait(2200);',
    'const idC = X.store.getState().activeId;',
    'const sesiC = () => X.store.getState().sessions.find((s) => s.id === idC) || {};',
    'out.C = { ws: S.getState().workspace, aktif: idC, sesiWs: sesiC().workspace, bedaDariB: idC !== idB };',
    '',
    '/* S6: semua permukaan sama. */',
    'const ids = X.store.getState().activeIds;',
    'out.permukaan = { jumlah: Object.keys(ids).length, semuaSama: Object.values(ids).every((v) => v === X.store.getState().activeId) };',
    '',
    '/* Bersihkan: hapus sesi uji, kembali ke folder semula. */',
    'for (const id of [idA, idB, idC]) X.store.getState().deleteChat(id);',
    'if (wsAwal) await S.getState().openWorkspace(wsAwal);',
    'await wait(1500);',
    'out.pulih = { ws: S.getState().workspace };',
    'return out;',
  ].join('\n'),
  400000,
);

R.check('S0', out.siap === true, 'app siap dan aksi ikutiWorkspace tersedia');
R.check(
  'S1',
  out.A?.sesiWs === A,
  `buka FolderUjiA -> sesi tercap ${JSON.stringify(out.A?.sesiWs)}`,
);
R.check(
  'S2',
  out.BbedaDariA === true && out.B?.sesiWs === B,
  `pindah ke FolderUjiB -> sesi berbeda=${out.BbedaDariA}, tercap ${JSON.stringify(out.B?.sesiWs)}`,
);
R.check(
  'S3',
  out.sesiATetapA === A,
  `sesi folder A TIDAK ikut pindah: ${JSON.stringify(out.sesiATetapA)}`,
);
R.check(
  'S4',
  out.balikA?.samaDenganIdA === true,
  `balik ke FolderUjiA -> sesi A dipilih lagi=${out.balikA?.samaDenganIdA}`,
);
R.check(
  'S5',
  out.C?.sesiWs === C && out.C?.bedaDariB === true,
  `folder baru -> chat baru tercap ${JSON.stringify(out.C?.sesiWs)} (beda dari B=${out.C?.bedaDariB})`,
);
R.check('S6', out.permukaan?.semuaSama === true, `semua ${out.permukaan?.jumlah} permukaan menunjuk sesi yang sama`);

R.selesai();
keluarBersih(process.exitCode === 1 ? 1 : 0);
