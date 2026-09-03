// v21/bagian2.mjs — V4..V6: rename & format, idle-shutdown, disable per bahasa.

import fs from 'node:fs';
import path from 'node:path';

const J = JSON.stringify;
const bacaFile = (p) => {
  try {
    return fs.readFileSync(p.replace(/\//g, path.sep), 'utf8');
  } catch (e) {
    return `GAGAL: ${e.message}`;
  }
};

export const bagian2 = async (cdp, check, FILE, FILE_REF) => {
  // ═════════ V4: rename lintas file + format dokumen ═════════
  //
  // Rename dijalankan lewat UI SUNGGUHAN (event → input → tombol), bukan
  // `L.rename()`. Alasannya penting: helper devBridge itu hanya MENGHITUNG
  // WorkspaceEdit dari server; yang menerapkannya ke buffer + menulis file lain
  // ke disk adalah LspOverlay. Menguji helper saja berarti menguji separuh
  // fitur — dan itulah yang bikin uji ini gagal pertama kali.
  const v4 = await cdp.json(
    `
    const L = window.__ZEPHYR_LSP__;

    // Buka file kedua supaya rename benar-benar lintas file, lalu kembali.
    await s.openPath(${J(FILE_REF)});
    await wait(4000);
    await s.openPath(${J(FILE)});
    await wait(2500);

    const st = S.getState();
    const file = st.tabs.find((t) => t.id === st.activeTabId).path;

    // Kursor di nama fungsi.
    L.goto(1, 20);
    await wait(300);

    // Buka dialog rename lewat jalur command (event yang sama).
    window.dispatchEvent(new Event('zephyr-lsp-rename'));
    await wait(600);
    const inp = q('[data-testid="lsp-rename-input"]');
    if (!inp) return JSON.stringify({ gagal: 'dialog rename tidak muncul' });
    const isiAwalInput = inp.value;

    // setNativeValue: mengubah .value langsung tidak memicu onChange React
    // (pelajaran fase 08).
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'jumlahAngka');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(250);

    q('[data-testid="lsp-rename-ok"]').click();
    // Rename lintas file menulis ke disk lewat Rust — beri waktu.
    await wait(4000);

    const dialogTutup = !q('[data-testid="lsp-rename-input"]');
    const notif = window.__ZEPHYR_NOTIF__.items().slice(-1)[0] || null;
    const cm = window.__ZEPHYR_CM__();
    const isiSetelahRename = cm.state.doc.toString();

    // Simpan tab aktif supaya file utama juga sampai ke disk.
    const tabId = S.getState().activeTabId;
    window.__ZEPHYR_FLUSH__(tabId);
    await wait(300);
    await S.getState().saveTab(tabId);
    await wait(800);

    // Format: rusak indentasinya, lalu minta LSP merapikan.
    const cm2 = window.__ZEPHYR_CM__();
    const isi = cm2.state.doc.toString();
    const target = '  return a + b;';
    const idx = isi.indexOf(target);
    cm2.dispatch({ changes: { from: idx, to: idx + target.length, insert: '        return a+b;' } });
    await wait(1500);
    const sebelumFormat = cm2.state.doc.toString().includes('        return a+b;');
    const nEdit = await L.format(file);
    await wait(700);
    const isiAkhir = window.__ZEPHYR_CM__().state.doc.toString();

    return JSON.stringify({
      file, isiAwalInput, dialogTutup,
      notifMsg: notif ? notif.message : null,
      renameDiBuffer: isiSetelahRename.includes('jumlahAngka'),
      masihAdaNamaLama: /tambahAngka/.test(isiSetelahRename),
      jmlDiBuffer: (isiSetelahRename.match(/jumlahAngka/g) || []).length,
      sebelumFormat, nEdit,
      formatRapi: isiAkhir.includes('  return a + b;'),
      formatBersih: !isiAkhir.includes('        return a+b;'),
    });
  `,
    180000,
  );
  const isiRef = bacaFile(FILE_REF);
  const isiUtama = bacaFile(FILE);
  check(
    'V4',
    !v4.gagal &&
      v4.isiAwalInput === 'tambahAngka' &&
      v4.dialogTutup &&
      v4.renameDiBuffer &&
      !v4.masihAdaNamaLama &&
      v4.jmlDiBuffer >= 3 &&
      isiUtama.includes('jumlahAngka') &&
      !isiUtama.includes('tambahAngka') &&
      isiRef.includes('jumlahAngka') &&
      !isiRef.includes('tambahAngka') &&
      v4.sebelumFormat &&
      v4.nEdit > 0 &&
      v4.formatRapi &&
      v4.formatBersih,
    v4.gagal
      ? v4.gagal
      : `F2 membuka dialog dengan isi awal "${v4.isiAwalInput}" (kata di kursor); ganti ke ` +
        `"jumlahAngka" → dialog tertutup, notif "${v4.notifMsg}". Buffer editor: ` +
        `${v4.jmlDiBuffer} kemunculan nama baru, nama lama hilang (${!v4.masihAdaNamaLama}). ` +
        `DI DISK: __uji21.ts ${isiUtama.includes('jumlahAngka') ? 'pakai nama baru' : 'GAGAL'}, ` +
        `__uji21_ref.ts (file yang TIDAK sedang diedit) ` +
        `${isiRef.includes('jumlahAngka') ? 'ikut berubah' : 'GAGAL'} — rename lintas file nyata. ` +
        `Format: indentasi dirusak → ${v4.nEdit} edit dari server → rapi kembali (${v4.formatRapi})`,
  );

  // ═════════ V5: idle-shutdown, proses benar-benar mati ═════════
  const v5 = await cdp.json(
    `
    const L = window.__ZEPHYR_LSP__;
    const P = window.__ZEPHYR_PANEL__;
    const sebelum = await L.status();
    const pid = sebelum[0] ? sebelum[0].pid : null;
    const id = sebelum[0] ? sebelum[0].id : null;

    // Percepat idle jadi 2 detik supaya harness tidak menunggu 5 menit.
    if (id) await L.setIdle(id, 2);

    // Tutup SEMUA tab .ts → didClose dikirim, open_docs jadi 0.
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await wait(1500);
    const setelahTutup = await L.status();
    const docsKosong = setelahTutup[0] ? setelahTutup[0].open_docs : -1;

    // Tunggu lewat batas idle lalu panggil reaper.
    //
    // PENTING: reaper di App.tsx berjalan tiap 30 detik dan BISA mendahului
    // kita — kalau itu terjadi, reap() di sini mengembalikan array kosong
    // padahal fiturnya bekerja. Jadi yang diuji adalah HASIL AKHIRNYA (server
    // benar-benar mati); jumlah yang dimatikan hanya info tambahan.
    // (Catatan: JANGAN pakai backtick di komentar ini — kode V5 hidup di dalam
    //  template literal, satu backtick saja menutup string-nya.)
    await wait(3000);
    const dimatikan = await L.reap();
    await wait(600);
    const sesudah = await L.status();
    const aktifStore = L.aktif();
    const logLsp = P.output.tail('lsp', 4);
    const adaLogIdle = logLsp.some((l) => l.includes('idle'));

    return JSON.stringify({
      pid, id, docsKosong, dimatikan, adaLogIdle,
      sisa: sesudah.length, aktifStore, logLsp,
      ram: S.getState().ramBytes,
    });
  `,
    120000,
  );
  // Bukti paling keras: PID-nya benar-benar hilang dari tasklist.
  const { spawnSync } = await import('node:child_process');
  const tl = spawnSync('tasklist', ['/FI', `PID eq ${v5.pid}`], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, MSYS2_ARG_CONV_EXCL: '*' },
  });
  const masihHidup = (tl.stdout || '').includes(String(v5.pid));
  const ramMB = Number.isFinite(v5.ram) && v5.ram > 0 ? Math.round(v5.ram / 1024 / 1024) : null;
  check(
    'V5',
    v5.docsKosong === 0 &&
      v5.sisa === 0 &&
      v5.aktifStore.length === 0 &&
      v5.adaLogIdle &&
      !masihHidup &&
      (ramMB === null || ramMB < 400),
    `tutup semua tab .ts → open_docs ${v5.docsKosong}; setelah lewat batas idle server ` +
      `DIMATIKAN: lsp_status kosong (${v5.sisa}), store frontend kosong, dan Output "LSP" ` +
      `mencatat alasannya (${v5.adaLogIdle}: "${(v5.logLsp.find((l) => l.includes('idle')) ?? '').slice(0, 60)}"). ` +
      `tasklist PID ${v5.pid}: ${masihHidup ? 'MASIH HIDUP' : 'sudah hilang'} — proses node ` +
      `benar-benar dilepas, bukan hanya dihapus dari registry. ` +
      `RAM app ${ramMB ?? '—'} MB (target < 400)`,
  );

  // ═════════ V6: bahasa dinonaktifkan → server tidak start ═════════
  const v6 = await cdp.json(
    `
    const L = window.__ZEPHYR_LSP__;
    await L.stopAll();
    await wait(500);

    // 1) Matikan HANYA TypeScript lewat Settings.
    await S.getState().applySettings({ lsp: { servers: { typescript: { enabled: false } } } });
    await wait(500);
    const specMati = L.katalog().find((k) => k.id === 'typescript').spec;
    const idMati = await L.ensureFor(${J(FILE)});
    await wait(1200);
    const statusMati = await L.status();

    // Buka file: tidak boleh ada server, tidak boleh crash, editor tetap jalan.
    await s.openPath(${J(FILE)});
    await wait(2500);
    const statusSetelahBuka = await L.status();
    const cmAda = !!window.__ZEPHYR_CM__();
    const errConsole = (window.__ZEPHYR_ERRORS__ || []).length;

    // 2) Master switch off juga harus menghentikan semuanya.
    await S.getState().applySettings({ lsp: { enabled: false, servers: { typescript: { enabled: true } } } });
    await wait(400);
    const idMaster = await L.ensureFor(${J(FILE)});

    // 3) Nyalakan lagi → server start normal (bukti togglenya dua arah).
    await S.getState().applySettings({ lsp: { enabled: true } });
    await wait(400);
    const idHidup = await L.ensureFor(${J(FILE)});
    await wait(2000);
    const statusHidup = await L.status();

    // Bersihkan.
    await L.stopAll();
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await S.getState().applySettings({ lsp: { enabled: true, idleSeconds: 300, servers: {} } });

    return JSON.stringify({
      specMatiEnabled: specMati.enabled,
      idMati, statusMati: statusMati.length,
      statusSetelahBuka: statusSetelahBuka.length,
      cmAda, errConsole,
      idMaster,
      idHidup, statusHidup: statusHidup.length,
    });
  `,
    150000,
  );
  check(
    'V6',
    v6.specMatiEnabled === false &&
      v6.idMati === null &&
      v6.statusMati === 0 &&
      v6.statusSetelahBuka === 0 &&
      v6.cmAda &&
      v6.errConsole === 0 &&
      v6.idMaster === null &&
      typeof v6.idHidup === 'string' &&
      v6.statusHidup === 1,
    `Settings → TypeScript dimatikan: spec.enabled=${v6.specMatiEnabled}, ensureFor ` +
      `mengembalikan ${v6.idMati}, 0 server hidup — bahkan setelah file .ts dibuka ` +
      `(${v6.statusSetelahBuka} server) editor tetap berfungsi (${v6.cmAda}) tanpa error console. ` +
      `Master switch off juga memblokir (${v6.idMaster}). Dinyalakan lagi → server start ` +
      `"${v6.idHidup}" (${v6.statusHidup} hidup)`,
  );
};
