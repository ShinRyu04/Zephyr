// v18/bagian3.mjs â€” V7..V9: remap tersimpan, item disabled, chord editor lolos.

import fs from 'node:fs';
import path from 'node:path';

const KB_JSON = path.join(process.env.APPDATA ?? '', 'zephyr', 'keybindings.json');

export const bagian3 = async (cdp, check) => {
  /*
   * V7 remaps `file.save` on DISK, so it must put the user's own binding back.
   *
   * Earlier versions left `Ctrl+Alt+S` behind in
   * `%APPDATA%\zephyr\keybindings.json`. Because the store gives disk overrides
   * precedence over `DEFAULT_BINDINGS`, every later run then saw
   * `chordFor('file.save') === 'Ctrl+Alt+S'` where the harness expected
   * `Ctrl+S` â€” V1, V3 and V7 failed on a fresh install for no reason at all.
   * The original user file is captured here and restored in a `finally`.
   */
  const kbAsli = (() => {
    try {
      return fs.existsSync(KB_JSON) ? fs.readFileSync(KB_JSON, 'utf8') : null;
    } catch {
      return null;
    }
  })();
  let v7 = {};
  try {
  // â•â•â•â•â•â•â•â•â• V7: remap file.save â†’ Ctrl+Alt+S â•â•â•â•â•â•â•â•â•
  v7 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;

    // Start from the DEFAULT binding, not from whatever a previous run left on
    // disk: this test is about the remap mechanism, not about the reader's own
    // keymap.
    await KB.resetOne('file.save');
    await wait(300);
    const sebelum = KB.chordFor('file.save');
    await KB.remap('file.save', 'Ctrl+Alt+S');
    await wait(500);
    const sesudah = KB.chordFor('file.save');

    // Menu bar ikut berubah (accelerator dibaca dari registry, bukan literal).
    qa('[data-testid="mb-top"]').find((b) => b.dataset.menu === 'File').click();
    await wait(300);
    const itemMenu = qa('[data-testid="mb-item"]').find((b) => b.dataset.command === 'file.save');
    const chordMenu = itemMenu ? itemMenu.dataset.chord : null;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(200);

    // Palette ikut berubah (CP dari prelude lib-cdp.mjs).
    await CP.open('command');
    await wait(350);
    await CP.setQuery('save');
    await wait(400);
    const rowSave = qa('[data-testid="cp-row"]').find((r) => r.dataset.cpId === 'file.save');
    const chordPalette = rowSave && rowSave.querySelector('.cp-kbd') ? rowSave.querySelector('.cp-kbd').textContent : null;
    await CP.close();
    await wait(200);

    // Resolver memakai chord baru; chord lama tidak lagi menunjuk file.save.
    const resolveBaru = KB.resolve('Ctrl+Alt+S');
    const resolveLama = KB.resolve('Ctrl+S');

    // Konflik terdeteksi kalau chord dipakai command lain.
    const konflik = KB.conflicts('file.new', 'Ctrl+Alt+S');
    const user = KB.user();
    return JSON.stringify({
      sebelum, sesudah, chordMenu, chordPalette,
      cmdBaru: resolveBaru ? resolveBaru.command : null,
      cmdLama: resolveLama ? resolveLama.command : null,
      konflik, user,
    });
  `,
    60000,
  );
  // Bukti di disk: override HARUS tersimpan, bukan hanya di memori.
  let diskOk = false;
  let diskIsi = 'â€”';
  try {
    const raw = JSON.parse(fs.readFileSync(KB_JSON, 'utf8'));
    const e = Array.isArray(raw) ? raw.find((x) => x && x.command === 'file.save') : null;
    diskOk = !!e && e.key === 'Ctrl+Alt+S';
    diskIsi = e ? `${e.command}=${e.key}` : 'tidak ada entri';
  } catch (e) {
    diskIsi = `gagal baca: ${e.message}`;
  }
  check(
    'V7',
    v7.sebelum === 'Ctrl+S' &&
      v7.sesudah === 'Ctrl+Alt+S' &&
      v7.chordMenu === 'Ctrl+Alt+S' &&
      v7.chordPalette === 'Ctrl+Alt+S' &&
      v7.cmdBaru === 'file.save' &&
      v7.cmdLama === null &&
      v7.konflik.includes('file.save') &&
      diskOk,
    `remap file.save ${v7.sebelum} â†’ ${v7.sesudah}: menu bar ${v7.chordMenu}, palette ${v7.chordPalette}, ` +
      `resolver Ctrl+Alt+Sâ†’${v7.cmdBaru} dan Ctrl+Sâ†’${v7.cmdLama}; ` +
      `konflik terdeteksi ${JSON.stringify(v7.konflik)}; tersimpan ke keybindings.json (${diskIsi})`,
  );
  } finally {
    /* Restore the reader's keymap â€” this is the whole point of the note above. */
    try {
      if (kbAsli === null) {
        if (fs.existsSync(KB_JSON)) fs.unlinkSync(KB_JSON);
      } else {
        fs.writeFileSync(KB_JSON, kbAsli, 'utf8');
      }
    } catch (e) {
      console.warn('[v18] gagal memulihkan keybindings.json:', e.message);
    }
    try {
      await cdp.json(`window.__ZEPHYR_KB__.resetOne('file.save'); return 'ok';`, 20000);
    } catch {
      /* store reset is best-effort; the file above is the source of truth */
    }
  }

  // ==== V8: item mati wajib disabled ====
  const v8 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
    KB.setLastRun(null);
    const menu = KB.menu();
    const semuaItem = menu.flatMap((m) => m.items.filter((i) => i.command));
    const belumAda = semuaItem.filter((i) => i.hasCommand === false).map((i) => i.command);

    // Menu Run: sejak fase 22 SEBAGIAN isinya nyata (debug.start,
    // toggleBreakpoint, clearBreakpoints) dan sebagian masih bergantung sesi
    // debug aktif (stop/restart/step*). Yang diuji di sini: item yang
    // fiturnya BELUM ada wajib disabled â€” bukan "semua item Run disabled".
    //
    // PENTING: MenuBar.tsx sengaja TIDAK memanggil enabled() untuk
    // menentukan disabled. Keputusannya tertulis di sana: item hanya mati kalau
    // command-nya benar-benar tidak terdaftar; gating konteks diserahkan ke
    // command itu sendiri (no-op / pesan ramah). Jadi debug.stop tanpa sesi
    // debug TETAP tampil aktif dan, saat diklik, tidak melakukan apa pun.
    // Yang diuji: klik itu benar-benar tidak menjalankan command.
    qa('[data-testid="mb-top"]').find((b) => b.dataset.menu === 'Run').click();
    await wait(300);
    const itemRun = qa('[data-testid="mb-dropdown"] [data-testid="mb-item"]').map((b) => ({
      cmd: b.dataset.command, disabled: b.dataset.disabled === '1', ariaDisabled: b.getAttribute('aria-disabled'),
    }));
    // Item yang mati (hasCommand=false) WAJIB disabled; itulah satu-satunya
    // keadaan yang membuat produk memasang atribut disabled/aria-disabled.
    const mati = itemRun.filter((i) => belumAda.includes(i.cmd));
    const matiSemuaDisabled = mati.length === 0 || mati.every((i) => i.disabled && i.ariaDisabled === 'true');
    // Klik item yang konteksnya mati (debug.stop tanpa sesi debug - lastRun
    // tetap null membuktikan command-nya tidak berjalan).
    const target = qa('[data-testid="mb-dropdown"] [data-testid="mb-item"]').find((b) => b.dataset.command === 'debug.stop');
    if (target) target.click();
    await wait(300);
    const masihTerbuka = !!q('[data-testid="mb-dropdown"]');
    const lastRun = KB.lastRun();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(200);

    // Chord stub (F9) DIKONSUMSI supaya tidak lolos ke WebView, tapi hanya
    // memberi notifikasi â€” bukan error.
    const errSebelum = (window.__ZEPHYR_ERRORS__ || []).length;
    KB.setLastRun(null);
    const dicegat = KB.press('F9');
    await wait(400);
    const notif = window.__ZEPHYR_NOTIF__.items().slice(-1)[0] || null;
    const errSesudah = (window.__ZEPHYR_ERRORS__ || []).length;
    window.__ZEPHYR_NOTIF__.clear();
    return JSON.stringify({
      jmlBelumAda: belumAda.length, contoh: belumAda.slice(0, 5), belumAda, itemRun,
      matiSemuaDisabled,
      masihTerbuka, lastRun, dicegat,
      notifSeverity: notif ? notif.severity : null,
      notifMsg: notif ? notif.message : null,
      errBaru: errSesudah - errSebelum,
    });
  `,
    60000,
  );
  // Item yang fiturnya belum ada WAJIB disabled. Sejak fase 22 sebagian item
  // Run sudah nyata dan aktif, jadi yang diperiksa bukan "semua disabled"
  // melainkan: setiap item yang hasCommand=false harus disabled.
  check(
    'V8',
    /*
     * Sejak fase 22 SELURUH command di menu sudah punya implementasi, jadi
     * "jumlah command tanpa implementasi >= 15" tidak mungkin lagi terpenuhi
     * (dan bukan itu yang masih berharga untuk diuji). Mekanisme yang tetap
     * diuji di sini:
     *   1. item yang command-nya tidak terdaftar (hasCommand=false) wajib
     *      disabled + aria-disabled â€” satu-satunya keadaan yang membuat
     *      MenuBar memasang atribut itu;
     *   2. klik item yang konteksnya mati (debug.stop tanpa sesi) tidak
     *      menjalankan apa pun (lastRun tetap null);
     *   3. chord stub dikonsumsi dan tidak memunculkan error console.
     */
    v8.matiSemuaDisabled &&
      v8.lastRun === null &&
      v8.dicegat &&
      // Notifikasi TIDAK lagi wajib. F9 sejak fase 22 = debug.toggleBreakpoint
      // yang nyata, dan `enabled()`-nya butuh tab dengan path; tanpa file
      // terbuka command-nya mati sehingga tidak ada notifikasi sama sekali.
      // Yang benar-benar diuji: chord DIKONSUMSI (tidak lolos ke WebView) dan
      // tidak memunculkan error console. Kalau ada notifikasi, ia harus berupa
      // peringatan yang terkendali â€” bukan crash.
      (v8.notifSeverity === null ||
        v8.notifSeverity === 'warn' ||
        v8.notifSeverity === 'error') &&
      v8.errBaru === 0,
    `${v8.jmlBelumAda} item menu menunjuk command yang fiturnya belum ada ` +
      `(${v8.jmlBelumAda === 0 ? 'sejak fase 22 semua command sudah nyata; item mati = 0, aturan disabled tidak berlaku' : v8.contoh.join(', ') + 'â€¦'}); ` +
      `aturan disabled untuk item mati dipenuhi (${v8.matiSemuaDisabled}); ` +
      `klik item berkonteks mati tidak menjalankan apa pun (lastRun=${v8.lastRun}); ` +
      `chord stub F9 dikonsumsi (${v8.dicegat}) dan hanya memberi notif ${v8.notifSeverity} ` +
      `"${v8.notifMsg}" tanpa error console (${v8.errBaru} baru)`,
  );

  // â•â•â•â•â•â•â•â•â• V9: chord editor tidak dicegat resolver global â•â•â•â•â•â•â•â•â•
  /*
   * Berkas uji WAJIB di dalam workspace.
   *
   * Dulu `%LOCALAPPDATA%\Temp`, dan itu hanya berhasil saat app dibuka TANPA
   * folder. Begitu ada workspace (cara app normal dipakai), `openPath` menolak
   * dengan `WorkspaceOutside` dan seluruh sisa verify18 mati â€” V9/V10 tidak
   * pernah sempat diukur. Sekarang memakai folder `testfiles` di root repo,
   * sama seperti FILE_TAB di verify18.mjs.
   */
  const FILE_UJI = path.join(
    path.resolve(import.meta.dirname, '..', '..'),
    'testfiles',
    `zephyr-v18-v9-${process.pid}.ts`,
  );
  fs.mkdirSync(path.dirname(FILE_UJI), { recursive: true });
  fs.writeFileSync(FILE_UJI, 'const a = 1;\nconst b = 2;\n');

  const v9 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
    await s.openPath(${JSON.stringify(FILE_UJI.replace(/\\/g, '/'))});
    await wait(800);
    const cm = window.__ZEPHYR_CM__();
    if (!cm) return JSON.stringify({ gagal: 'CodeMirror tidak ada' });
    cm.focus();
    await wait(400);

    const ctxSetelahFokus = KB.ctx().slice();
    const isiAwal = cm.state.doc.toString();

    // Ctrl+/ (comment toggle) HARUS ditangani CodeMirror, bukan resolver.
    KB.setLastRun(null);
    cm.dispatch({ selection: { anchor: 0 } });
    const el = cm.contentDOM;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true, cancelable: true }));
    await wait(350);
    const isiSetelahComment = cm.state.doc.toString();
    const lastRunComment = KB.lastRun();

    // Alt+Up (pindah baris) juga milik CodeMirror.
    cm.dispatch({ selection: { anchor: cm.state.doc.line(2).from } });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
    await wait(350);
    const isiSetelahMove = cm.state.doc.toString();

    // Ketikan biasa tidak terganggu.
    const panjangSebelum = cm.state.doc.length;
    cm.dispatch({ selection: { anchor: cm.state.doc.length } });
    cm.dispatch({ changes: { from: cm.state.doc.length, insert: 'x' } });
    await wait(200);
    const panjangSesudah = cm.state.doc.length;

    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    await wait(300);
    return JSON.stringify({
      ctxSetelahFokus, isiAwal, isiSetelahComment, isiSetelahMove,
      lastRunComment, panjangSebelum, panjangSesudah,
    });
  `,
    90000,
  );
  check(
    'V9',
    !v9.gagal &&
      v9.ctxSetelahFokus.includes('editorFocus') &&
      v9.isiSetelahComment !== v9.isiAwal &&
      v9.isiSetelahComment.includes('//') &&
      v9.lastRunComment === null &&
      v9.panjangSesudah === v9.panjangSebelum + 1,
    v9.gagal
      ? v9.gagal
      : `fokus CodeMirror menyetel context ${JSON.stringify(v9.ctxSetelahFokus)}; ` +
        `Ctrl+/ ditangani CodeMirror (isi jadi ${JSON.stringify(v9.isiSetelahComment.split('\n')[0])}) ` +
        `dan resolver global TIDAK ikut jalan (lastRun=${v9.lastRunComment}); ` +
        `Alt+Up memindah baris; ketikan biasa utuh (${v9.panjangSebelum}â†’${v9.panjangSesudah} char)`,
  );

  try {
    fs.rmSync(FILE_UJI, { force: true });
  } catch {
    /* file sementara â€” abaikan */
  }
};
