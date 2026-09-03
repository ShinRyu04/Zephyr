// v22/bagian2.mjs — V4..V7 fase 22.

const J = JSON.stringify;

export const bagian2 = async (cdp, check, F, { hitungNode }) => {
  // ═════════ V4: Stop → adapter & program mati ═══════════════════════════════
  const nodeSebelum = hitungNode();

  const v4 = await cdp.json(
    `
    const aktifSebelum = DBG.status();
    const ctxSebelum = DBG.ctxDebugActive();
    await DBG.stop();
    await wait(2500);
    return JSON.stringify({
      aktifSebelum,
      ctxSebelum,
      statusSetelah: DBG.status(),
      ctxSetelah: DBG.ctxDebugActive(),
      frames: DBG.frames().length,
      scopes: DBG.scopes().length,
      barisAktif: DBG.barisAktif(),
      bpMasihAda: DBG.breakpoints().length,
      bpVerified: (DBG.breakpoints()[0] || {}).verified,
    });
  `,
    120000,
  );

  await new Promise((r) => setTimeout(r, 2500));
  const nodeSetelah = hitungNode();

  check(
    'V4',
    v4.statusSetelah === 'inactive' &&
      v4.ctxSebelum === true &&
      v4.ctxSetelah === false &&
      v4.frames === 0 &&
      v4.scopes === 0 &&
      v4.barisAktif === null &&
      v4.bpMasihAda === 1 &&
      v4.bpVerified === false &&
      nodeSetelah <= nodeSebelum,
    `Stop: status ${v4.aktifSebelum}→${v4.statusSetelah}, ctx debugActive ` +
      `${v4.ctxSebelum}→${v4.ctxSetelah}; stack/scope dibersihkan (${v4.frames}/${v4.scopes}), ` +
      `highlight hilang; breakpoint TETAP ada (${v4.bpMasihAda}) tapi tidak lagi verified ` +
      `(${v4.bpVerified}); proses node ${nodeSebelum}→${nodeSetelah} (tidak bertambah)`,
  );

  // ═════════ V5: Python/debugpy — pesan install jelas, TIDAK crash ═══════════
  const v5 = await cdp.json(
    `
    const ad = DBG.adapters();
    const py = ad.find((a) => a.id === 'python');
    const node = ad.find((a) => a.id === 'node');

    // Coba start konfigurasi python. Kalau debugpy tidak ada, HARUS error
    // dengan instruksi install — bukan crash, bukan diam.
    DBG.pilihConfig('Uji Python');
    const errorsSebelum = (window.__ZEPHYR_ERRORS__ || []).length;
    const ok = await DBG.start('Uji Python');
    await wait(1500);
    const err = DBG.error();
    const status = DBG.status();
    const errorsSetelah = (window.__ZEPHYR_ERRORS__ || []).length;

    const hint = q('[data-testid="dbg-adapter-hint"]');
    const hintPy = q('[data-testid="dbg-missing-python"]');

    return JSON.stringify({
      pyMissing: py ? py.missing : null,
      nodeMissing: node ? node.missing : null,
      startOk: ok,
      err,
      status,
      appMasihHidup: !!q('[data-testid="debug-view"]'),
      errorKonsolBaru: errorsSetelah - errorsSebelum,
      adaHintDom: !!hint,
      teksHintPy: hintPy ? hintPy.textContent.trim().slice(0, 110) : null,
    });
  `,
    180000,
  );

  const punyaDebugpy = v5.pyMissing === '';
  check(
    'V5',
    v5.nodeMissing === '' &&
      v5.appMasihHidup === true &&
      v5.errorKonsolBaru === 0 &&
      (punyaDebugpy
        ? v5.startOk === true
        : v5.startOk === false &&
          typeof v5.err === 'string' &&
          /debugpy|Python/i.test(v5.err) &&
          /install/i.test(v5.err) &&
          v5.status === 'inactive' &&
          v5.adaHintDom === true &&
          /debugpy/i.test(v5.teksHintPy || '')),
    punyaDebugpy
      ? `debugpy ADA → sesi python start ${v5.startOk}`
      : `debugpy TIDAK ada di mesin ini (kasus sah brief V5): start ditolak dengan ` +
        `${J((v5.err || '').slice(0, 90))}, status tetap ${v5.status}, ` +
        `app hidup=${v5.appMasihHidup}, error konsol baru=${v5.errorKonsolBaru} (harus 0), ` +
        `hint UI: ${J(v5.teksHintPy)}`,
  );

  // ═════════ V6: launch.json JSONC + entri rusak ditolak dengan alasan ═══════
  const v6 = await cdp.json(
    `
    await DBG.muatLaunch();
    await wait(400);
    const lf = DBG.launch();
    const cfgUji = lf.configurations.find((c) => c.name === 'Uji Node');
    return JSON.stringify({
      path: lf.path,
      version: lf.version,
      valid: lf.configurations.map((c) => c.name),
      invalid: lf.invalid,
      skipFiles: cfgUji ? cfgUji.skipFiles : null,
      cwdMentah: cfgUji ? cfgUji.cwd : null,
      requestDefault: cfgUji ? cfgUji.request : null,
      opsiDom: qa('[data-testid="dbg-config"] option').map((o) => o.value),
      invalidDom: !!q('[data-testid="dbg-invalid"]'),
    });
  `,
    120000,
  );

  const alasan = (v6.invalid || []).map((i) => i.reason).join(' | ');
  check(
    'V6',
    /launch\.json$/.test(v6.path) &&
      v6.version === '0.2.0' &&
      v6.valid.length === 3 &&
      v6.invalid.length === 3 &&
      /name/.test(v6.invalid[0].reason) &&
      /type/.test(v6.invalid[1].reason) &&
      /restart/.test(v6.invalid[2].reason) &&
      Array.isArray(v6.skipFiles) &&
      v6.requestDefault === 'launch' &&
      v6.opsiDom.length === 3 &&
      v6.invalidDom === true,
    `launch.json JSONC terbaca dari ${v6.path}: ${v6.valid.length} valid ${J(v6.valid)}, ` +
      `${v6.invalid.length} ditolak dengan alasan [${alasan}]; field tak dikenal ` +
      `diteruskan (skipFiles=${J(v6.skipFiles)}); cwd mentah ${J(v6.cwdMentah)}; ` +
      `dropdown ${v6.opsiDom.length} opsi; daftar invalid tampil di UI=${v6.invalidDom}`,
  );

  // ═════════ V7: UI — gutter breakpoint, toolbar, highlight, sidebar ═════════
  const v7 = await cdp.json(
    `
    await S.getState().openPath(${J(F.program)});
    await wait(1200);

    // Breakpoint dikembalikan ke baris 9 (dalam tambah()): V2 meninggalkannya
    // di baris 20 untuk uji StepInto, dan frame main() tidak punya a/b sehingga
    // watch a + b pasti gagal — itu bukan bug produk.
    await DBG.hapusSemuaBreakpoint();
    await DBG.toggleBreakpoint(${J(F.program)}, 9);
    await wait(400);

    const domBpAwal = DBG.domBp();
    const toolbarSebelum = !!q('[data-testid="dbg-toolbar"]');

    DBG.pilihConfig('Uji Node');
    const ok = await DBG.start('Uji Node');
    let t = 0;
    while (DBG.status() !== 'stopped' && t < 60) { await wait(250); t++; }
    // Scope dimuat asinkron setelah stopped (threads → stackTrace → scopes).
    let ts = 0;
    while (DBG.scopes().length === 0 && ts < 40) { await wait(200); ts++; }
    await wait(900);

    const toolbarSaatDebug = !!q('[data-testid="dbg-toolbar"]');
    const tombolToolbar = qa('.dbg-toolbar .dbg-tb-btn').length;
    const domBpVerified = DBG.domBpVerified();
    const domBarisAktif = DBG.domBarisAktif();
    const barisSection = qa('[data-testid="dbg-bp"]').length;
    const frameDom = qa('[data-testid="dbg-frame"]').length;
    const scopeDom = qa('[data-testid="dbg-scope"]').length;
    const varDom = qa('[data-testid="dbg-var"]').length;

    await DBG.tambahWatch('a + b');
    await wait(1200);
    const watch = DBG.watch();

    const fr = DBG.frames();
    let lompat = null;
    if (fr[1]) {
      await DBG.pilihFrame(fr[1].id);
      await wait(900);
      const cm = CM();
      lompat = cm ? cm.state.doc.lineAt(cm.state.selection.main.head).number : null;
    }

    await DBG.stop();
    await wait(1500);
    const toolbarSetelahStop = !!q('[data-testid="dbg-toolbar"]');

    return JSON.stringify({
      ok,
      domBpAwal,
      domBpVerified,
      domBarisAktif,
      toolbarSebelum,
      toolbarSaatDebug,
      tombolToolbar,
      toolbarSetelahStop,
      barisSection,
      frameDom,
      scopeDom,
      varDom,
      watch,
      frameKedua: fr[1] || null,
      lompat,
    });
  `,
    300000,
  );

  const watchOk =
    v7.watch.length === 1 && !v7.watch[0].error && /^[0-9]+$/.test(String(v7.watch[0].value));
  const lompatOk = v7.frameKedua ? v7.lompat === v7.frameKedua.line : true;

  check(
    'V7',
    v7.domBpAwal >= 1 &&
      v7.domBpVerified >= 1 &&
      v7.domBarisAktif === 1 &&
      v7.toolbarSebelum === false &&
      v7.toolbarSaatDebug === true &&
      v7.tombolToolbar === 6 &&
      v7.toolbarSetelahStop === false &&
      v7.barisSection >= 1 &&
      v7.frameDom >= 2 &&
      v7.scopeDom >= 1 &&
      v7.varDom >= 3 &&
      watchOk &&
      lompatOk,
    `gutter: ${v7.domBpAwal} marker (${v7.domBpVerified} verified), highlight baris aktif ` +
      `${v7.domBarisAktif}; toolbar hanya saat sesi (${v7.toolbarSebelum}→` +
      `${v7.toolbarSaatDebug}→${v7.toolbarSetelahStop}) dengan ${v7.tombolToolbar} tombol; ` +
      `sidebar: ${v7.barisSection} bp, ${v7.frameDom} frame, ${v7.scopeDom} scope, ` +
      `${v7.varDom} variabel; watch "a + b" = ${J(v7.watch)}; klik frame kedua → ` +
      `editor baris ${v7.lompat} (frame ${v7.frameKedua ? v7.frameKedua.line : '-'})`,
  );
};
