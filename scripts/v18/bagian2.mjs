// v18/bagian2.mjs — V4..V6: chord sequence, context key, konflik F11.

export const bagian2 = async (cdp, check) => {
  // ═════════ V4: chord sequence Ctrl+K Ctrl+S ═════════
  const v4 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
    KB.setLastRun(null);
    KB.setPending('');
    KB.editor(false);
    await wait(200);

    // Ctrl+K adalah PREFIX: tidak boleh menjalankan apa pun.
    const dicegat1 = KB.press('Ctrl+K');
    await wait(250);
    const pendingSetelah1 = KB.pending();
    const lastRunSetelah1 = KB.lastRun();
    const editorSetelah1 = KB.editorOpen();

    // Ctrl+S menyelesaikan sequence → editor Keyboard Shortcuts terbuka.
    KB.press('Ctrl+S');
    await wait(400);
    const editorSetelah2 = KB.editorOpen();
    const adaPanel = !!q('[data-testid="kb-table"]');
    const pendingSetelah2 = KB.pending();
    const lastRun2 = KB.lastRun();
    KB.editor(false);
    await wait(200);

    // Ctrl+K lalu Esc → pending dibatalkan, tidak ada yang jalan.
    KB.setLastRun(null);
    KB.press('Ctrl+K');
    await wait(200);
    const pendingSebelumEsc = KB.pending();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(250);
    const pendingSetelahEsc = KB.pending();
    const lastRunEsc = KB.lastRun();

    // Ctrl+S SENDIRIAN (tanpa prefix) tetap = save, bukan bagian sequence.
    const resolveSaja = KB.resolve('Ctrl+S');
    const resolveSeq = KB.resolve('Ctrl+K Ctrl+S');
    return JSON.stringify({
      dicegat1, pendingSetelah1, lastRunSetelah1, editorSetelah1,
      editorSetelah2, adaPanel, pendingSetelah2, lastRun2,
      pendingSebelumEsc, pendingSetelahEsc, lastRunEsc,
      cmdSaja: resolveSaja ? resolveSaja.command : null,
      cmdSeq: resolveSeq ? resolveSeq.command : null,
    });
  `,
    60000,
  );
  check(
    'V4',
    v4.dicegat1 &&
      v4.pendingSetelah1 === 'Ctrl+K' &&
      v4.lastRunSetelah1 === null &&
      !v4.editorSetelah1 &&
      v4.editorSetelah2 &&
      v4.adaPanel &&
      v4.pendingSetelah2 === '' &&
      v4.lastRun2 === 'workbench.openGlobalKeybindings' &&
      v4.pendingSebelumEsc === 'Ctrl+K' &&
      v4.pendingSetelahEsc === '' &&
      v4.lastRunEsc === null &&
      v4.cmdSaja === 'file.save' &&
      v4.cmdSeq === 'workbench.openGlobalKeybindings',
    `Ctrl+K ditahan sebagai prefix (pending="${v4.pendingSetelah1}", tidak menjalankan apa pun); ` +
      `Ctrl+S menyelesaikan → ${v4.lastRun2}, panel tabel muncul (${v4.adaPanel}); ` +
      `Ctrl+K lalu Esc membatalkan (pending "${v4.pendingSebelumEsc}" → "${v4.pendingSetelahEsc}", lastRun=${v4.lastRunEsc}); ` +
      `Ctrl+S sendirian tetap ${v4.cmdSaja}`,
  );

  // ═════════ V5: context key editor vs terminal ═════════
  const v5 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
    // Tanpa fokus khusus: Ctrl+Up tidak punya pemilik global.
    KB.setCtx('editorFocus', false);
    KB.setCtx('terminalFocus', false);
    await wait(150);
    const netral = KB.resolve('Ctrl+Up');

    // Konteks terminal aktif → Ctrl+Up milik terminal.
    KB.setCtx('terminalFocus', true);
    await wait(150);
    const diTerminal = KB.resolve('Ctrl+Up');

    // Konteks editor: Ctrl+Z milik editor (CodeMirror), bukan app.
    KB.setCtx('terminalFocus', false);
    KB.setCtx('editorFocus', true);
    await wait(150);
    const zEditor = KB.resolve('Ctrl+Z');
    const slashEditor = KB.resolve('Ctrl+/');

    // Chord app tetap app walau fokus di editor (Ctrl+B toggle sidebar).
    const bApp = KB.resolve('Ctrl+B');

    KB.setCtx('editorFocus', false);
    await wait(100);
    return JSON.stringify({
      netral: netral ? { c: netral.command, l: netral.layer } : null,
      diTerminal: diTerminal ? { c: diTerminal.command, l: diTerminal.layer } : null,
      zEditor: zEditor ? { c: zEditor.command, l: zEditor.layer } : null,
      slashEditor: slashEditor ? { c: slashEditor.command, l: slashEditor.layer } : null,
      bApp: bApp ? { c: bApp.command, l: bApp.layer } : null,
    });
  `,
    40000,
  );
  check(
    'V5',
    v5.netral === null &&
      v5.diTerminal &&
      v5.diTerminal.c === 'terminal.scrollLineUp' &&
      v5.diTerminal.l === 'terminal' &&
      v5.zEditor &&
      v5.zEditor.l === 'editor' &&
      v5.slashEditor &&
      v5.slashEditor.c === 'editor.comment.toggle' &&
      v5.bApp &&
      v5.bApp.l === 'app',
    `context key menentukan pemilik chord: Ctrl+Up tanpa fokus = ${v5.netral} (tidak ada), ` +
      `fokus terminal → ${v5.diTerminal.c} layer ${v5.diTerminal.l}; ` +
      `fokus editor → Ctrl+Z=${v5.zEditor.c} (${v5.zEditor.l}), Ctrl+/=${v5.slashEditor.c}; ` +
      `Ctrl+B tetap layer ${v5.bApp.l}`,
  );

  // ═════════ V6: F11 — fullscreen vs step-into saat debugActive ═════════
  const v6 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
    KB.setCtx('debugActive', false);
    await wait(150);
    const normal = KB.resolve('F11');

    KB.setCtx('debugActive', true);
    await wait(150);
    const saatDebug = KB.resolve('F11');
    const f5 = KB.resolve('F5');
    const shiftF5 = KB.resolve('Shift+F5');

    KB.setCtx('debugActive', false);
    await wait(100);
    const shiftF5Mati = KB.resolve('Shift+F5');
    return JSON.stringify({
      normal: normal ? { c: normal.command, l: normal.layer, w: normal.when } : null,
      saatDebug: saatDebug ? { c: saatDebug.command, l: saatDebug.layer, w: saatDebug.when } : null,
      f5: f5 ? { c: f5.command, l: f5.layer } : null,
      shiftF5: shiftF5 ? shiftF5.command : null,
      shiftF5Mati,
    });
  `,
    40000,
  );
  check(
    'V6',
    v6.normal &&
      v6.normal.c === 'window.fullscreen' &&
      v6.saatDebug &&
      v6.saatDebug.c === 'debug.stepInto' &&
      v6.saatDebug.w === 'debugActive' &&
      v6.f5 &&
      v6.f5.l === 'stub' &&
      v6.shiftF5 === 'debug.stop' &&
      v6.shiftF5Mati === null,
    `F11 di luar debug = ${v6.normal.c} (when=${v6.normal.w}); saat debugActive = ${v6.saatDebug.c} ` +
      `(when=${v6.saatDebug.w}) — resolver memilih binding paling spesifik. ` +
      `F5=${v6.f5.c} layer ${v6.f5.l}; Shift+F5 hanya hidup saat debug (${v6.shiftF5} → ${v6.shiftF5Mati})`,
  );
};
