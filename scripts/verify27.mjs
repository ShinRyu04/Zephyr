// verify27.mjs — verifikasi fase 27 (Notification Center & Toast).
//
// Pakai:  node scripts/verify27.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev`.
//
// Peta V → spesifikasi fase 27:
//   V1  tsc bersih + store terpasang
//   V2  info auto-hide; error sticky + tombol aksi menjalankan command
//   V3  progress tampil, naik, selesai → hilang
//   V4  lonceng: badge unread, Read all, Clear all, Do Not Disturb meredam
//   V5  tidak ada alert()/confirm() native tersisa (grep = 0) + dialog hapus
//       Explorer benar-benar bekerja lewat jalur baru

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify27');
const J = JSON.stringify;

const BASE = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp', `zephyr-p27-${process.pid}`);
const WS = path.join(BASE, 'ws');

const main = async () => {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });
  fs.writeFileSync(path.join(WS, 'hapus-aku.txt'), 'file untuk uji hapus\n');
  fs.writeFileSync(path.join(WS, 'hapus-aku2.txt'), 'file kedua\n');
  fs.writeFileSync(path.join(WS, 'simpan.txt'), 'jangan dihapus\n');

  const { cdp, page } = await Cdp.attach(CDP_PORT);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_NOTIF__')) === 'undefined') {
    throw new Error('__ZEPHYR_NOTIF__ tidak ada — reload halaman (devBridge fase 27)');
  }

  await cdp.runAsync(
    `
    const N = window.__ZEPHYR_NOTIF__;
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setSettingsOpen(false);
    N.clear();
    N.setDnd(false);
    N.center(false);
    N.cancelDelete();
    await window.__ZEPHYR_SET_PAUSED__(false);
    await S.getState().openWorkspace(${J(WS)});
    await wait(600);
    return 'siap';
  `,
    60000,
  );

  // ═════════ V1: store terpasang + API dasar ═════════
  const v1 = await cdp.json(
    `
    const N = window.__ZEPHYR_NOTIF__;
    const id = N.notify({ severity: 'info', message: 'uji dasar', source: 'harness' });
    await wait(300);
    const it = N.items().find((x) => x.id === id);
    const adaStack = !!q('[data-testid="toast-stack"]');
    const live = q('[data-testid="toast-stack"]') ? q('[data-testid="toast-stack"]').getAttribute('aria-live') : null;
    N.clear();
    await wait(200);
    return JSON.stringify({ id, it, adaStack, live,
                            setelahClear: N.items().length,
                            toastSetelahClear: N.toasts().length });
  `,
    40000,
  );
  check(
    'V1',
    !!v1.it &&
      v1.it.severity === 'info' &&
      v1.it.source === 'harness' &&
      v1.adaStack &&
      v1.live === 'polite' &&
      v1.setelahClear === 0 &&
      v1.toastSetelahClear === 0,
    `notify() → item tercatat (${v1.it?.severity}/${v1.it?.source}), toast-stack ter-render dengan aria-live="${v1.live}", clear() mengosongkan riwayat & toast`,
  );

  // ═════════ V2: info auto-hide, error sticky + aksi jalan ═════════
  const v2 = await cdp.json(
    `
    const N = window.__ZEPHYR_NOTIF__;
    N.clear();
    const idInfo = N.notify({ severity: 'info', message: 'info singkat' });
    const idErr = N.notify({
      severity: 'error', message: 'gagal sesuatu', detail: 'detail teknis',
      actions: [{ label: 'Buka Notifikasi', command: 'notifications.show' }],
    });
    await wait(400);
    const awal = {
      toasts: N.toasts().length,
      infoAda: N.toasts().includes(idInfo),
      errAda: N.toasts().includes(idErr),
      errSticky: (N.items().find((x) => x.id === idErr) || {}).sticky,
      infoSticky: (N.items().find((x) => x.id === idInfo) || {}).sticky,
      domToast: qa('[data-testid="toast"]').length,
      adaAksi: qa('[data-testid="toast-action"]').length,
      roleErr: (qa('[data-testid="toast"]').find((el) => el.dataset.severity === 'error') || {}).getAttribute
        ? qa('[data-testid="toast"]').find((el) => el.dataset.severity === 'error').getAttribute('role') : null,
    };
    // Tunggu lewat batas auto-hide (4.2s) — info harus hilang, error tetap.
    await wait(5200);
    const sesudah = {
      infoAda: N.toasts().includes(idInfo),
      errAda: N.toasts().includes(idErr),
      riwayat: N.items().length,
    };
    // Klik tombol aksi → command notifications.show harus membuka center.
    N.center(false);
    const btn = qa('[data-testid="toast-action"]')[0];
    if (btn) btn.click();
    await wait(600);
    const centerTerbuka = N.centerOpen();
    N.center(false);
    N.clear();
    return JSON.stringify({ awal, sesudah, centerTerbuka, adaBtn: !!btn });
  `,
    60000,
  );
  check(
    'V2',
    v2.awal.toasts === 2 &&
      v2.awal.errSticky === true &&
      v2.awal.infoSticky === false &&
      v2.awal.domToast === 2 &&
      v2.awal.adaAksi === 1 &&
      v2.awal.roleErr === 'alert' &&
      v2.sesudah.infoAda === false &&
      v2.sesudah.errAda === true &&
      v2.sesudah.riwayat === 2 &&
      v2.adaBtn &&
      v2.centerTerbuka === true,
    `info auto-hide setelah 4,2s (toast ${v2.awal.toasts}→error saja), error STICKY dengan role="alert" dan tetap tampil; riwayat tetap ${v2.sesudah.riwayat} entri; klik tombol aksi menjalankan command notifications.show → center terbuka (${v2.centerTerbuka})`,
  );

  // ═════════ V3: progress ═════════
  const v3 = await cdp.json(
    `
    const N = window.__ZEPHYR_NOTIF__;
    N.clear();
    const id = N.notify({ severity: 'info', message: 'Mengunduh sesuatu', progress: 0 });
    await wait(350);
    const bar0 = q('[data-testid="toast-bar"]');
    const lebar0 = bar0 ? bar0.firstElementChild.style.width : null;
    const sticky = (N.items().find((x) => x.id === id) || {}).sticky;
    N.progress(id, 45);
    await wait(350);
    const lebar45 = q('[data-testid="toast-bar"]') ? q('[data-testid="toast-bar"]').firstElementChild.style.width : null;
    // Indeterminate juga harus dirender.
    const id2 = N.notify({ severity: 'info', message: 'Tanpa persen', progress: 'indeterminate' });
    await wait(300);
    const indet = qa('[data-testid="toast-bar"]').filter((b) => b.dataset.indeterminate === '1').length;
    // Selesai → toast hilang sendiri (riwayat tetap).
    N.progress(id, 100);
    await wait(1500);
    const masihTampil = N.toasts().includes(id);
    const diRiwayat = !!N.items().find((x) => x.id === id);
    N.clear();
    return JSON.stringify({ lebar0, lebar45, sticky, indet, masihTampil, diRiwayat });
  `,
    60000,
  );
  check(
    'V3',
    v3.lebar0 === '0%' &&
      v3.lebar45 === '45%' &&
      v3.sticky === true &&
      v3.indet === 1 &&
      v3.masihTampil === false &&
      v3.diRiwayat === true,
    `progress 0% → 45% (bar ikut: "${v3.lebar0}" → "${v3.lebar45}"), notifikasi ber-progress otomatis sticky, mode indeterminate dirender (${v3.indet}); progress(100) → toast hilang tapi riwayat tetap ada (${v3.diRiwayat})`,
  );

  // ═════════ V4: lonceng, badge, read all, clear all, DND ═════════
  const v4 = await cdp.json(
    `
    const N = window.__ZEPHYR_NOTIF__;
    N.clear();
    N.setDnd(false);
    N.center(false);
    await wait(200);
    N.notify({ severity: 'info', message: 'satu' });
    N.notify({ severity: 'warn', message: 'dua' });
    N.notify({ severity: 'error', message: 'tiga' });
    await wait(400);
    const bell = q('[data-testid="nc-bell"]');
    const badge = q('[data-testid="nc-badge"]');
    const sebelum = {
      unread: N.unread(),
      badgeText: badge ? badge.textContent.trim() : null,
      bellUnreadAttr: bell ? bell.dataset.unread : null,
    };
    // Klik lonceng → panel terbuka & semua ditandai terbaca.
    bell.click();
    await wait(500);
    const panel = q('[data-testid="nc-panel"]');
    const sesudahKlik = {
      panelAda: !!panel,
      jumlahBaris: qa('[data-testid="nc-item"]').length,
      total: (q('[data-testid="nc-total"]') || {}).textContent || null,
      unread: N.unread(),
      badgeMasihAda: !!q('[data-testid="nc-badge"]'),
    };
    // DND: nyalakan lalu kirim notifikasi baru — TOAST diredam, riwayat naik.
    q('[data-testid="nc-dnd"]').click();
    await wait(300);
    const dndOn = N.dnd();
    const riwayatSebelum = N.items().length;
    N.notify({ severity: 'info', message: 'saat dnd' });
    await wait(500);
    const saatDnd = {
      toasts: N.toasts().length,
      domToast: qa('[data-testid="toast"]').length,
      riwayat: N.items().length,
      naik: N.items().length - riwayatSebelum,
      bellDnd: (q('[data-testid="nc-bell"]') || {}).dataset?.dnd ?? null,
    };
    // Clear all → riwayat kosong.
    q('[data-testid="nc-clear"]').click();
    await wait(400);
    const sesudahClear = {
      items: N.items().length,
      empty: !!q('[data-testid="nc-empty"]'),
    };
    N.setDnd(false);
    q('[data-testid="nc-close"]').click();
    await wait(300);
    const tertutup = !q('[data-testid="nc-panel"]');
    return JSON.stringify({ sebelum, sesudahKlik, dndOn, saatDnd, sesudahClear, tertutup });
  `,
    90000,
  );
  check(
    'V4',
    v4.sebelum.unread === 3 &&
      v4.sebelum.badgeText === '3' &&
      v4.sesudahKlik.panelAda &&
      v4.sesudahKlik.jumlahBaris === 3 &&
      v4.sesudahKlik.unread === 0 &&
      !v4.sesudahKlik.badgeMasihAda &&
      v4.dndOn === true &&
      v4.saatDnd.toasts === 0 &&
      v4.saatDnd.domToast === 0 &&
      v4.saatDnd.naik === 1 &&
      v4.saatDnd.bellDnd === '1' &&
      v4.sesudahClear.items === 0 &&
      v4.sesudahClear.empty &&
      v4.tertutup,
    `badge unread ${v4.sebelum.badgeText}; klik lonceng → panel dengan ${v4.sesudahKlik.jumlahBaris} baris, unread jadi ${v4.sesudahKlik.unread} & badge hilang; DND ON → notifikasi baru TIDAK jadi toast (${v4.saatDnd.domToast} di DOM) tapi riwayat tetap naik ${v4.saatDnd.naik}; Clear all → kosong (empty state ${v4.sesudahClear.empty}); Tutup → panel hilang`,
  );

  // ═════════ V5: tidak ada alert/confirm native + dialog hapus bekerja ═════════
  const rg = spawnSync(
    'node',
    [
      '-e',
      `const fs=require('fs'),p=require('path');
       let hit=[];
       const walk=(d)=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){
         const fp=p.join(d,f.name);
         if(f.isDirectory()){walk(fp);continue;}
         if(!/\\.(ts|tsx)$/.test(f.name))continue;
         const src=fs.readFileSync(fp,'utf8');
         src.split(/\\r?\\n/).forEach((line,i)=>{
           if(/^\\s*(\\/\\/|\\*)/.test(line))return;
           if(/\\bwindow\\.(alert|confirm|prompt)\\s*\\(/.test(line)||/(^|[^.\\w])(alert|confirm|prompt)\\s*\\(/.test(line)&&!/\\.(confirm|prompt)/.test(line)&&!/(setConfirm|resolveConfirm|confirmCmd|confirmDelete|cancelDelete|askDelete|ScmConfirm|ConfirmDialog|confirmed)/.test(line)){
             hit.push(fp.replace(/.*[\\\\/]src[\\\\/]/,'src/')+':'+(i+1)+': '+line.trim().slice(0,70));
           }
         });
       }};
       walk('src');
       console.log(JSON.stringify(hit));`,
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const nativeHits = JSON.parse((rg.stdout ?? '[]').trim() || '[]');

  const fHapus = path.join(WS, 'hapus-aku.txt');
  const fHapus2 = path.join(WS, 'hapus-aku2.txt');
  const v5 = await cdp.json(
    `
    const N = window.__ZEPHYR_NOTIF__;
    N.clear();
    // 1) Batal → file TETAP ada, tidak ada notifikasi.
    N.askDelete([${J(fHapus)}]);
    await wait(400);
    const dialogAda = !!q('[data-testid="del-title"]');
    const judul = (q('[data-testid="del-title"]') || {}).textContent || null;
    const body = ((q('[data-testid="del-body"]') || {}).textContent || '').slice(0, 70);
    q('[data-testid="del-cancel"]').click();
    await wait(400);
    const setelahBatal = { dialog: !!q('[data-testid="del-title"]'), pending: N.pendingDelete() };
    // 2) Konfirmasi → file dihapus + notifikasi info muncul.
    N.askDelete([${J(fHapus)}, ${J(fHapus2)}]);
    await wait(400);
    const judul2 = (q('[data-testid="del-title"]') || {}).textContent || null;
    const adaDaftar = qa('[data-testid="del-list"] li').length;
    q('[data-testid="del-ok"]').click();
    await wait(1200);
    const notif = N.items()[0] || null;
    return JSON.stringify({ dialogAda, judul, body, setelahBatal, judul2, adaDaftar,
                            notif, dialogTutup: !q('[data-testid="del-title"]') });
  `,
    60000,
  );
  const masihAda1 = fs.existsSync(fHapus);
  const masihAda2 = fs.existsSync(fHapus2);
  const simpanAman = fs.existsSync(path.join(WS, 'simpan.txt'));
  check(
    'V5',
    nativeHits.length === 0 &&
      v5.dialogAda &&
      /hapus-aku\.txt/.test(v5.judul ?? '') &&
      /PERMANEN/.test(v5.body ?? '') &&
      v5.setelahBatal.dialog === false &&
      v5.setelahBatal.pending === null &&
      /2 item/.test(v5.judul2 ?? '') &&
      v5.adaDaftar === 2 &&
      !masihAda1 &&
      !masihAda2 &&
      simpanAman &&
      v5.notif?.severity === 'info' &&
      /dihapus/i.test(v5.notif?.message ?? ''),
    `grep alert/confirm/prompt native di src/ = ${nativeHits.length} temuan${nativeHits.length ? ` (${nativeHits.join(' | ')})` : ''}; dialog hapus dalam-app: "${(v5.judul ?? '').slice(0, 40)}" dengan kata PERMANEN, Batal → file tetap ada, konfirmasi 2 file (daftar ${v5.adaDaftar} item) → keduanya terhapus, file lain aman (${simpanAman}), notifikasi "${v5.notif?.message}"`,
  );

  // ═════════ V6: tsc + state bersih + 0 console error ═════════
  const v6 = await cdp.json(
    `
    const N = window.__ZEPHYR_NOTIF__;
    N.clear();
    N.setDnd(false);
    N.center(false);
    N.cancelDelete();
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    for (const p of await PTY.list()) { try { await D.kill(p.id); } catch (e) {} }
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await S.getState().closeWorkspace();
    await wait(700);
    const err = (window.__ZEPHYR_ERRORS__ || []).filter((e) =>
      !/ERR_ABORTED|favicon|ResizeObserver/.test(e));
    return JSON.stringify({ err: err.slice(0, 3), errN: err.length,
                            items: N.items().length, toasts: N.toasts().length,
                            cmdNotif: CP.available().filter((c) => c.id.startsWith('notifications.')).map((c) => c.id) });
  `,
    60000,
  );
  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  const tsc = spawnSync(process.execPath, [tscJs, '--noEmit'], { cwd: process.cwd(), encoding: 'utf8' });
  const tscOut = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();
  check(
    'V6',
    tsc.status === 0 &&
      tscOut === '' &&
      v6.errN === 0 &&
      v6.items === 0 &&
      v6.toasts === 0 &&
      v6.cmdNotif.length === 3,
    `tsc --noEmit exit ${tsc.status} tanpa output; ${v6.errN} console error sepanjang V1–V5; 3 command notifikasi terdaftar di palette (${v6.cmdNotif.join(', ')}); state bersih`,
  );

  fs.rmSync(BASE, { recursive: true, force: true });
  cdp.close();
  selesai();
};

main().catch((e) => {
  console.error(`verify27 error: ${e.message}`);
  process.exitCode = 1;
});
