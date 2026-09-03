// v28/bagian1.mjs — V1b, V2, V3 fase 28.
//
// PERINGATAN: jangan pakai backtick di komentar yang ada di dalam template
// literal (kena 4 kali di fase 22/25/26).

const J = JSON.stringify;

export const bagian1 = async (cdp, check, F) => {
  // ═══════════ V1b: banner berwarna lewat jalur produk (Rust) ═══════════
  //
  // Harness tidak punya TTY, jadi warna diuji dengan memanggil cli_teks
  // (fungsi yang sama yang dipakai --help/--version) dengan warna:true.
  const v1b = await cdp.json(`
    const wHelp = await CLI.teks('help', true, 100);
    const pHelp = await CLI.teks('help', false, 100);
    const wVer = await CLI.teks('version', true, 100);
    const pVer = await CLI.teks('version', false, 100);
    const sempit = await CLI.teks('banner', false, 30);
    return JSON.stringify({
      wHelpAnsi: wHelp.includes('\\u001b['),
      wHelpAccent: wHelp.includes('38;2;79;140;255'),
      pHelpAnsi: pHelp.includes('\\u001b['),
      wVerAnsi: wVer.includes('\\u001b['),
      pVerBaris: pVer.trim().split('\\n').length,
      pVerIsi: pVer.trim(),
      asciiAda: pHelp.includes('_____'),
      sempitBaris: sempit.trim().split('\\n').length,
    })
  `);

  check(
    'F28-V1b',
    v1b.wHelpAnsi &&
      v1b.wHelpAccent &&
      !v1b.pHelpAnsi &&
      v1b.wVerAnsi &&
      v1b.pVerBaris === 1 &&
      /^zephyr \d/.test(v1b.pVerIsi) &&
      v1b.asciiAda &&
      v1b.sempitBaris === 1,
    `TTY: help ansi ${v1b.wHelpAnsi} accent#4f8cff ${v1b.wHelpAccent}, version ansi ${v1b.wVerAnsi}; ` +
      `pipe: help ansi ${v1b.pHelpAnsi}, version ${v1b.pVerBaris} baris ("${v1b.pVerIsi}"), ` +
      `ascii ${v1b.asciiAda}; 30 kolom -> ${v1b.sempitBaris} baris`,
  );

  // ═══════════════ V2: zephyr <folder> → workspace terbuka ═══════════════
  const v2 = await cdp.json(`
    // Mulai dari workspace lain supaya perubahannya benar-benar terlihat.
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(700);
    const wsSebelum = S.getState().workspace;

    CLI.bersihkan();
    // Argumen di-parse lewat Rust, bukan dikarang di JS: ini sekaligus menguji
    // bahwa FOLDER dikenali sebagai Target::Folder, bukan file.
    const args = await CLI.parse([${J(F.ws)}], 'D:/Zephyr');
    await CLI.jalankan(args);
    await wait(1500);

    return JSON.stringify({
      wsSebelum,
      bentukTarget: Object.keys(args.targets[0] || {}),
      isiFolder: (args.targets[0] || {}).folder || '',
      wsSesudah: S.getState().workspace,
      jumlahJalan: CLI.jumlahJalan(),
      errors: args.errors,
    })
  `);

  const norm = (s) => String(s || '').replace(/\\/g, '/').toLowerCase();
  const v2ok =
    v2.bentukTarget.join() === 'folder' &&
    norm(v2.isiFolder) === norm(F.ws) &&
    norm(v2.wsSesudah) === norm(F.ws) &&
    norm(v2.wsSebelum) !== norm(v2.wsSesudah) &&
    v2.jumlahJalan === 1 &&
    v2.errors.length === 0;

  check(
    'F28-V2',
    v2ok,
    `target ${J(v2.bentukTarget)}; workspace ${v2.wsSebelum} -> ${v2.wsSesudah}; ` +
      `jalan ${v2.jumlahJalan}x, errors ${v2.errors.length}`,
  );

  // ═════════ V3: zephyr file.ts:10:5 → tab terbuka & kursor 10:5 ═════════
  const v3 = await cdp.json(`
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(800);
    // Tutup semua tab supaya "tab terbuka" tidak tercampur sisa uji lain.
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    await wait(400);
    const tabSebelum = S.getState().tabs.length;

    CLI.bersihkan();
    const args = await CLI.parse([${J(F.target + ':10:5')}], 'D:/Zephyr');
    await CLI.jalankan(args);
    await wait(1600);

    const st = S.getState();
    const tab = st.tabs.find((t) => t.id === st.activeTabId);
    // Posisi kursor dibaca dari EditorView NYATA, bukan dari state kita.
    const view = window.__ZEPHYR_CM__();
    let baris = 0;
    let kolom = 0;
    if (view) {
      const pos = view.state.selection.main.head;
      const l = view.state.doc.lineAt(pos);
      baris = l.number;
      kolom = pos - l.from + 1;
    }
    return JSON.stringify({
      tabSebelum,
      tabSesudah: st.tabs.length,
      parseLine: (args.targets[0] || {}).file ? args.targets[0].file.line : null,
      parseCol: (args.targets[0] || {}).file ? args.targets[0].file.col : null,
      pathTab: tab ? tab.path : '',
      baris,
      kolom,
      isiBaris: view ? view.state.doc.line(10).text : '',
    })
  `);

  const v3ok =
    v3.parseLine === 10 &&
    v3.parseCol === 5 &&
    v3.tabSesudah === v3.tabSebelum + 1 &&
    norm(v3.pathTab) === norm(F.target) &&
    v3.baris === 10 &&
    v3.kolom === 5 &&
    v3.isiBaris.includes('TARGET_BARIS_10');

  check(
    'F28-V3',
    v3ok,
    `parse 10:5 -> ${v3.parseLine}:${v3.parseCol}; tab ${v3.tabSebelum}->${v3.tabSesudah} ` +
      `(${v3.pathTab.split(/[\\/]/).pop()}); kursor di ${v3.baris}:${v3.kolom}`,
  );
};
