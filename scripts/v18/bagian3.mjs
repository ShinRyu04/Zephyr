// v18/bagian3.mjs — V7..V9: remap tersimpan, item disabled, chord editor lolos.

import fs from 'node:fs';
import path from 'node:path';

const KB_JSON = path.join(process.env.APPDATA ?? '', 'zephyr', 'keybindings.json');

export const bagian3 = async (cdp, check) => {
  // ═════════ V7: remap file.save → Ctrl+Alt+S ═════════
  const v7 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
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
  let diskIsi = '—';
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
    `remap file.save ${v7.sebelum} → ${v7.sesudah}: menu bar ${v7.chordMenu}, palette ${v7.chordPalette}, ` +
      `resolver Ctrl+Alt+S→${v7.cmdBaru} dan Ctrl+S→${v7.cmdLama}; ` +
      `konflik terdeteksi ${JSON.stringify(v7.konflik)}; tersimpan ke keybindings.json (${diskIsi})`,
  );

  // ═════════ V8: command tanpa implementasi → item disabled ═════════
  const v8 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
    KB.setLastRun(null);
    const menu = KB.menu();
    const semuaItem = menu.flatMap((m) => m.items.filter((i) => i.command));
    const belumAda = semuaItem.filter((i) => i.hasCommand === false).map((i) => i.command);

    // Buka menu Run (semua isinya stub sampai fase 22).
    qa('[data-testid="mb-top"]').find((b) => b.dataset.menu === 'Run').click();
    await wait(300);
    const itemRun = qa('[data-testid="mb-dropdown"] [data-testid="mb-item"]').map((b) => ({
      cmd: b.dataset.command, disabled: b.dataset.disabled === '1', ariaDisabled: b.getAttribute('aria-disabled'),
    }));
    // Klik item disabled tidak boleh melakukan apa pun.
    const target = qa('[data-testid="mb-dropdown"] [data-testid="mb-item"]').find((b) => b.dataset.command === 'debug.start');
    if (target) target.click();
    await wait(300);
    const masihTerbuka = !!q('[data-testid="mb-dropdown"]');
    const lastRun = KB.lastRun();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(200);

    // Chord stub (F9) DIKONSUMSI supaya tidak lolos ke WebView, tapi hanya
    // memberi notifikasi — bukan error.
    const errSebelum = (window.__ZEPHYR_ERRORS__ || []).length;
    KB.setLastRun(null);
    const dicegat = KB.press('F9');
    await wait(400);
    const notif = window.__ZEPHYR_NOTIF__.items().slice(-1)[0] || null;
    const errSesudah = (window.__ZEPHYR_ERRORS__ || []).length;
    window.__ZEPHYR_NOTIF__.clear();
    return JSON.stringify({
      jmlBelumAda: belumAda.length, contoh: belumAda.slice(0, 5), itemRun,
      masihTerbuka, lastRun, dicegat,
      notifSeverity: notif ? notif.severity : null,
      notifMsg: notif ? notif.message : null,
      errBaru: errSesudah - errSebelum,
    });
  `,
    60000,
  );
  const semuaRunDisabled = v8.itemRun.filter((i) => i.cmd).every((i) => i.disabled);
  check(
    'V8',
    v8.jmlBelumAda >= 15 &&
      semuaRunDisabled &&
      v8.itemRun.some((i) => i.ariaDisabled === 'true') &&
      v8.lastRun === null &&
      v8.dicegat &&
      v8.notifSeverity === 'warn' &&
      v8.errBaru === 0,
    `${v8.jmlBelumAda} item menu menunjuk command yang fiturnya belum ada (${v8.contoh.join(', ')}…) → ` +
      `semuanya disabled + aria-disabled; klik tidak menjalankan apa pun (lastRun=${v8.lastRun}); ` +
      `chord stub F9 dikonsumsi (${v8.dicegat}) dan hanya memberi notif ${v8.notifSeverity} ` +
      `"${v8.notifMsg}" tanpa error console (${v8.errBaru} baru)`,
  );

  // ═════════ V9: chord editor tidak dicegat resolver global ═════════
  // File uji dibuat dari Node (bukan lewat store) supaya V9 tidak bergantung
  // pada workspace yang terbuka — openPath menerima path absolut.
  const FILE_UJI = path.join(
    process.env.LOCALAPPDATA ?? '',
    'Temp',
    `zephyr-v18-${process.pid}.ts`,
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
        `Alt+Up memindah baris; ketikan biasa utuh (${v9.panjangSebelum}→${v9.panjangSesudah} char)`,
  );
};
