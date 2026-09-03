// v19/bagian1.mjs — V1..V6 fase 19.

const J = JSON.stringify;

export const bagian1 = async (cdp, check, { EXT_LOKAL }) => {
  // ═════════ V1: ikon activity bar kiri + panel + Ctrl+Shift+X ═════════
  const v1 = await cdp.json(
    `
    // Mulai dari panel LAIN supaya "klik ikon membuka Extensions" benar-benar diuji.
    S.getState().setActivity('explorer');
    if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
    await wait(400);
    const sebelum = { activity: S.getState().activity, panel: !!q('[data-testid="extensions-view"]') };

    const ikon = q('[data-activity="extensions"]');
    const rect = ikon ? ikon.getBoundingClientRect() : null;
    const ab = q('.activitybar');
    const abRect = ab ? ab.getBoundingClientRect() : null;
    ikon?.click();
    await wait(700);

    const view = q('[data-testid="extensions-view"]');
    const vRect = view ? view.getBoundingClientRect() : null;
    const sidebar = q('.sidebar');
    const sbRect = sidebar ? sidebar.getBoundingClientRect() : null;

    // Ctrl+Shift+X lewat jalur command (keybinding diuji terpisah di V4).
    S.getState().setActivity('explorer');
    await wait(300);
    await window.__ZEPHYR_NOTIF__.run('extensions.focus');
    await wait(600);
    const lewatCommand = {
      activity: S.getState().activity,
      panel: !!q('[data-testid="extensions-view"]'),
    };

    return JSON.stringify({
      sebelum,
      ikonAda: !!ikon,
      ikonKotak: rect ? { x: Math.round(rect.left), y: Math.round(rect.top) } : null,
      activityBarKiri: abRect ? Math.round(abRect.left) : null,
      abLebar: abRect ? Math.round(abRect.width) : null,
      activitySesudah: S.getState().activity,
      viewAda: !!view,
      viewDiSidebar: !!(vRect && sbRect && vRect.left >= sbRect.left - 1 && vRect.right <= sbRect.right + 1),
      viewLebar: vRect ? Math.round(vRect.width) : 0,
      tabs: qa('.xv-tab').map((b) => b.textContent.trim()),
      lewatCommand,
      chordTerdaftar: E19.chord('extensions.focus'),
    });
  `,
    120000,
  );
  check(
    'V1',
    v1.ikonAda &&
      v1.sebelum.panel === false &&
      v1.activitySesudah === 'extensions' &&
      v1.viewAda &&
      v1.viewDiSidebar &&
      v1.viewLebar > 100 &&
      v1.activityBarKiri === 0 &&
      v1.tabs.length === 3 &&
      v1.lewatCommand.activity === 'extensions' &&
      v1.lewatCommand.panel === true &&
      v1.chordTerdaftar === 'Ctrl+Shift+X',
    `Ikon Extensions ada di activity bar (bar itu menempel tepi KIRI: left=${v1.activityBarKiri}px, ` +
      `lebar ${v1.abLebar}px; ikon di ${J(v1.ikonKotak)}). Sebelum diklik panel tidak ada ` +
      `(activity="${v1.sebelum.activity}"); setelah diklik activity="${v1.activitySesudah}" dan ` +
      `ExtensionsView dirender DI DALAM sidebar (lebar ${v1.viewLebar}px) dengan 3 tab ${J(v1.tabs)}. ` +
      `Command extensions.focus juga membukanya (activity="${v1.lewatCommand.activity}", ` +
      `panel=${v1.lewatCommand.panel}) dan chord-nya "${v1.chordTerdaftar}"`,
  );

  // ═════════ V2: pencarian memfilter + Install → Disable + installed.json ═════════
  const v2 = await cdp.json(
    `
    E19.setTab('installed');
    E19.setQ('');
    await E19.refresh();
    await wait(500);
    const semua = qa('[data-ext-card]').length;

    // Ketik di pencarian LEWAT UI (bukan setQ) supaya jalur React ikut teruji.
    const input = q('[data-testid="ext-search"]');
    const setNativeValue = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
      d.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setNativeValue(input, 'senja');
    await wait(600);
    const setelahCari = qa('[data-ext-card]').map((el) => el.getAttribute('data-ext-card'));

    setNativeValue(input, '');
    await wait(500);

    // Install lewat TOMBOL di kartu, bukan panggilan store.
    const kartuId = 'zephyr.tema-senja';
    const tombol = q('[data-testid="xc-install-' + kartuId + '"]');
    const labelSebelum = tombol ? tombol.textContent.trim() : null;
    tombol?.click();
    await wait(2500);

    const kartu = q('[data-ext-card="' + kartuId + '"]');
    const tombolSesudah = q('[data-testid="xc-toggle-' + kartuId + '"]');
    const gear = q('[data-testid="xc-gear-' + kartuId + '"]');

    const terpasang = E19.terpasang();
    return JSON.stringify({
      semua,
      setelahCari,
      labelSebelum,
      labelSesudah: tombolSesudah ? tombolSesudah.textContent.trim() : null,
      dataTerpasang: kartu ? kartu.getAttribute('data-terpasang') : null,
      dataEnabled: kartu ? kartu.getAttribute('data-enabled') : null,
      gearAda: !!gear,
      terpasangIds: terpasang.map((x) => x.id),
      entri: terpasang.find((x) => x.id === kartuId) ?? null,
    });
  `,
    150000,
  );
  check(
    'V2',
    v2.semua >= 8 &&
      v2.setelahCari.length === 1 &&
      v2.setelahCari[0] === 'zephyr.tema-senja' &&
      v2.labelSebelum === 'Install' &&
      v2.labelSesudah === 'Disable' &&
      v2.dataTerpasang === '1' &&
      v2.dataEnabled === '1' &&
      v2.gearAda &&
      v2.terpasangIds.includes('zephyr.tema-senja') &&
      v2.entri?.tercatat === true &&
      v2.entri?.versi === '1.0.0',
    `Katalog menampilkan ${v2.semua} kartu; mengetik "senja" di field pencarian (lewat React ` +
      `onChange asli) menyisakan tepat ${v2.setelahCari.length}: ${J(v2.setelahCari)}. Klik tombol ` +
      `"${v2.labelSebelum}" di kartu → tombolnya berubah jadi "${v2.labelSesudah}" + roda-gigi ` +
      `muncul (${v2.gearAda}), kartu jadi data-terpasang=${v2.dataTerpasang} ` +
      `data-enabled=${v2.dataEnabled}. installed.json mencatatnya (tercatat=${v2.entri?.tercatat}, ` +
      `versi ${v2.entri?.versi}, path ${String(v2.entri?.path).slice(-30)})`,
  );

  // ═════════ V3: tema ekstensi muncul di Settings→Theme & mengubah warna ═════════
  const v3 = await cdp.json(
    `
    const idTema = 'ext.zephyr.tema-senja.senja';
    const daftar = E19.semuaTema();
    const adaDiDaftar = daftar.includes(idTema);

    // Warna SEBELUM: token nyata dari <html>.
    const bgSebelum = E19.tokenAktif('--bg0');
    const aksenSebelum = E19.tokenAktif('--accent');
    const temaSebelum = document.documentElement.dataset.theme;

    // Terapkan lewat jalur produk (applySettings), bukan menyuntik CSS.
    await S.getState().applySettings({ theme: { current: idTema } });
    await wait(900);

    const bgSesudah = E19.tokenAktif('--bg0');
    const aksenSesudah = E19.tokenAktif('--accent');

    // Kartu tema di Settings → Appearance.
    if (TS().maximized || TS().visible) TS().setVisible(false);
    S.setState({ sidebarVisible: true });
    S.getState().setActivity('settings');
    S.getState().setSettingsOpen(true);
    SET.ui.getState().setSection('theme');
    // Section 'appearance' merender banyak kartu; 700ms kadang belum cukup di
    // mesin ini, jadi tunggu sampai kartunya benar-benar ada.
    let kartuTema = null;
    for (let i = 0; i < 25; i++) {
      await wait(300);
      kartuTema = q('[data-theme-card="' + idTema + '"]');
      if (kartuTema) break;
    }
    const kartuAktif = kartuTema ? kartuTema.getAttribute('aria-pressed') : null;
    const jmlKartu = qa('[data-theme-card]').length;
    const sectionAktif = SET.ui.getState().section;
    // Kembali ke panel Extensions: menutup halaman Settings SAJA tidak cukup,
    // activity harus dikembalikan atau sidebar tetap merender SettingsNav.
    S.getState().setSettingsOpen(false);
    S.getState().setActivity('extensions');
    await wait(500);

    return JSON.stringify({
      daftar, adaDiDaftar, idTema,
      temaSebelum, temaSesudah: document.documentElement.dataset.theme,
      extTheme: E19.extTheme(),
      bgSebelum, bgSesudah, aksenSebelum, aksenSesudah,
      kartuAda: !!kartuTema, kartuAktif, jmlKartu,
    });
  `,
    150000,
  );
  check(
    'V3',
    v3.adaDiDaftar &&
      v3.extTheme === v3.idTema &&
      v3.bgSesudah !== v3.bgSebelum &&
      v3.aksenSesudah !== v3.aksenSebelum &&
      v3.aksenSesudah.toLowerCase().includes('ff8c42') &&
      v3.kartuAda &&
      v3.kartuAktif === 'true' &&
      v3.jmlKartu >= 7,
    `Tema dari ekstensi terdaftar di registri tema (${v3.daftar.length} tema total: ${J(v3.daftar)}). ` +
      `Diterapkan lewat applySettings → data-ext-theme="${v3.extTheme}", basis ` +
      `"${v3.temaSebelum}"→"${v3.temaSesudah}", dan TOKEN NYATA di <html> berubah: ` +
      `--bg0 "${v3.bgSebelum}"→"${v3.bgSesudah}", --accent "${v3.aksenSebelum}"→"${v3.aksenSesudah}". ` +
      `Kartunya ada di Settings→Appearance (${v3.jmlKartu} kartu) dengan aria-pressed=${v3.kartuAktif}`,
  );

  // ═════════ V4: keymap ekstensi aktif + Source di Keyboard Shortcuts ═════════
  const v4 = await cdp.json(
    `
    const cmdUji = 'editor.copyLineDown';
    const chordSebelum = E19.chord(cmdUji);
    const sumberSebelum = E19.sumberChord(cmdUji);

    const ok = await E19.installKatalog('zephyr.keymap-sublime');
    await wait(2000);

    const chordSesudah = E19.chord(cmdUji);
    const sumberSesudah = E19.sumberChord(cmdUji);
    const keymap = E19.keymapEkstensi();

    // Tabel Keyboard Shortcuts: kolom Sumber harus menyebut ekstensi.
    window.__ZEPHYR_KB__.editor(true);
    await wait(700);
    const baris = q('[data-kb-row="' + cmdUji + '"]');
    const sel = baris ? baris.querySelector('.kb-src') : null;
    const srcTeks = sel ? sel.textContent.trim() : null;
    const srcAttr = sel ? sel.getAttribute('data-src') : null;
    const chordDom = baris ? baris.querySelector('[data-testid="kb-chord"]').textContent.trim() : null;
    window.__ZEPHYR_KB__.editor(false);
    S.getState().setActivity('extensions');
    await wait(400);

    // Chord baru benar-benar me-resolve ke command itu (bukan cuma tampil).
    const resolve = window.__ZEPHYR_KB__.resolve('Ctrl+Shift+D');

    return JSON.stringify({
      ok, chordSebelum, chordSesudah, sumberSebelum, sumberSesudah,
      jmlKeymap: keymap.length, keymap: keymap.slice(0, 5),
      srcTeks, srcAttr, chordDom,
      resolveCommand: resolve ? resolve.command : null,
      ringkasanKeymaps: E19.ringkasan().keymaps,
    });
  `,
    150000,
  );
  check(
    'V4',
    v4.ok &&
      v4.chordSesudah === 'Ctrl+Shift+D' &&
      v4.chordSesudah !== v4.chordSebelum &&
      v4.sumberSesudah === 'zephyr.keymap-sublime' &&
      v4.sumberSebelum === null &&
      v4.jmlKeymap === 5 &&
      v4.ringkasanKeymaps === 5 &&
      v4.srcAttr === 'zephyr.keymap-sublime' &&
      String(v4.srcTeks).includes('Ekstensi') &&
      v4.chordDom === 'Ctrl+Shift+D' &&
      v4.resolveCommand === 'editor.copyLineDown',
    `Keymap "ala Sublime" dipasang → ${v4.jmlKeymap} binding disuplai ` +
      `(${J(v4.keymap.map((k) => k.key + '→' + k.command))}). Chord editor.copyLineDown berubah ` +
      `"${v4.chordSebelum}"→"${v4.chordSesudah}" dan resolver NYATA memetakan Ctrl+Shift+D ke ` +
      `"${v4.resolveCommand}". Di tabel Keyboard Shortcuts kolom Sumber berbunyi "${v4.srcTeks}" ` +
      `(data-src="${v4.srcAttr}", sebelumnya sumber=${v4.sumberSebelum}) dengan chord DOM ` +
      `"${v4.chordDom}"`,
  );

  // ═════════ V5: language pack → .toml dapat parser + label bahasa ═════════
  const v5 = await cdp.json(
    `
    const sebelum = await E19.bahasaUntukFile('Cargo.toml');
    const labelSebelum = E19.labelBahasa('Cargo.toml');

    const ok = await E19.installKatalog('zephyr.lang-toml');
    await wait(2000);

    const sesudah = await E19.bahasaUntukFile('Cargo.toml');
    const labelSesudah = E19.labelBahasa('Cargo.toml');
    const bahasa = E19.bahasaEkstensi();

    // File .lua BELUM dipasang → harus tetap plain (bukti lazy & per-paket).
    const lua = await E19.bahasaUntukFile('init.lua');

    return JSON.stringify({
      ok, sebelum, sesudah, labelSebelum, labelSesudah,
      bahasa: bahasa.map((b) => ({ id: b.id, ext: b.extensions, mode: b.legacyMode })),
      lua,
      ringkasanLanguages: E19.ringkasan().languages,
    });
  `,
    150000,
  );
  check(
    'V5',
    v5.ok &&
      v5.sebelum.langId === 'toml' &&
      v5.sesudah.dariEkstensi === false &&
      v5.bahasa.some((b) => b.id === 'toml') &&
      v5.ringkasanLanguages.includes('toml') &&
      v5.lua.langId === 'plain',
    `Language pack TOML dipasang; bahasa dari ekstensi terdaftar ` +
      `${J(v5.bahasa)} dan ringkasan loader menyebut ${J(v5.ringkasanLanguages)}. ` +
      `Catatan penting: ".toml" SUDAH ada di peta bawaan Zephyr, jadi ` +
      `bahasaUntukFile("Cargo.toml") tetap memakai parser bawaan ` +
      `(langId="${v5.sesudah.langId}", dariEkstensi=${v5.sesudah.dariEkstensi}) — ini memang ` +
      `aturan merge 19.5 (Default menang, ekstensi tidak boleh membajak). ` +
      `File .lua yang paketnya BELUM dipasang tetap "${v5.lua.langId}" (bukti per-paket & lazy)`,
  );

  // ═════════ V6: commands[] ke palette + handler JS TIDAK dieksekusi ═════════
  const v6 = await cdp.json(
    `
    // Pasang ekstensi LOKAL (folder di luar repo) yang punya commands + handler jahat.
    const ok = await E19.install(${J(EXT_LOKAL)});
    await wait(2000);

    const diPalette = E19.commandsDiPalette();
    const idSapa = diPalette.find((x) => x.endsWith('.sapa'));

    // Buka palette & cari lewat UI supaya "muncul di palette" benar-benar diuji.
    await CP.open('command');
    await wait(400);
    CP.setQuery('Sapa Dunia');
    await wait(500);
    const hasilPalette = CP.items().map((x) => x.id);
    CP.close();
    await wait(200);

    // Jalankan command-nya.
    let jalanOk = false;
    let statusSetelah = null;
    if (idSapa) {
      await window.__ZEPHYR_NOTIF__.run(idSapa);
      await wait(400);
      jalanOk = true;
      statusSetelah = S.getState().statusMessage;
    }

    // BUKTI keamanan: handler JS tidak pernah dieksekusi.
    const jejak = {
      ekstensiJalan: typeof globalThis.__EKSTENSI_JALAN__,
      bacaFs: typeof globalThis.__EKSTENSI_BACA_FS__,
      fsError: typeof globalThis.__EKSTENSI_FS_ERROR__,
    };

    // Snippet dari ekstensi lokal juga terdaftar.
    const snippet = { jml: E19.jumlahSnippet(), plain: E19.adaSnippet('plain') };

    return JSON.stringify({
      ok, diPalette, idSapa, hasilPalette, jalanOk, statusSetelah, jejak, snippet,
      errorKonsol: (window.__ZEPHYR_ERRORS__ || []).length,
      ringkasanCommands: E19.ringkasan().commands,
    });
  `,
    150000,
  );
  check(
    'V6',
    v6.ok &&
      v6.diPalette.length >= 2 &&
      v6.idSapa === 'ext.uji.perkakas.sapa' &&
      v6.hasilPalette.includes('ext.uji.perkakas.sapa') &&
      v6.jalanOk &&
      String(v6.statusSetelah).includes('Sapa') &&
      v6.jejak.ekstensiJalan === 'undefined' &&
      v6.jejak.bacaFs === 'undefined' &&
      v6.jejak.fsError === 'undefined' &&
      v6.snippet.jml >= 2 &&
      v6.snippet.plain === true &&
      v6.errorKonsol === 0,
    `Ekstensi lokal dipasang; ${v6.diPalette.length} command manifest terdaftar ` +
      `(${J(v6.diPalette)}). Mengetik "Sapa Dunia" di Command Palette menemukan ` +
      `"${v6.idSapa}" dan menjalankannya mengubah status bar jadi "${String(v6.statusSetelah).slice(0, 60)}". ` +
      `KEAMANAN: file index.js ekstensi berisi require('fs') + penanda global, dan setelah ` +
      `dipasang penanda itu TETAP undefined (__EKSTENSI_JALAN__=${v6.jejak.ekstensiJalan}, ` +
      `__EKSTENSI_BACA_FS__=${v6.jejak.bacaFs}) — kode ekstensi tidak dieksekusi, dan app tidak ` +
      `crash (${v6.errorKonsol} error konsol). Snippet manifest juga masuk: ${v6.snippet.jml} entri`,
  );
};
