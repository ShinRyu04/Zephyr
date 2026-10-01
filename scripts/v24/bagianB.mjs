// v24/bagianB.mjs — V4 (color decorator), V5 (bracket + multi-cursor),
//                    V6 (toggle Settings & menu View + persist).
//
// CATATAN: `Input.dispatchKeyEvent` HANYA bisa dikirim dari sisi Node
// (cdp.send), bukan dari dalam kode halaman — di dalam runAsync tidak ada
// binding `CDP`. Jadi V5 dipecah: siapkan di halaman → tekan tombol dari Node
// → periksa hasilnya di halaman.

const J = JSON.stringify;

/** Tekan satu chord lewat pipa input asli WebView2. */
const tekan = async (cdp, { key, code, vk, modifiers = 0, teks }) => {
  await cdp.send('Input.dispatchKeyEvent', {
    type: teks ? 'keyDown' : 'rawKeyDown',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    ...(teks ? { text: teks } : {}),
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  });
  await new Promise((r) => setTimeout(r, 260));
};

const CTRL = 2;
const ALT = 1;
const SHIFT = 8;

export const bagianB = async (cdp, check, FILE) => {
  // ═════════ V4: swatch warna + ubah via picker mengubah teks ═════════
  const v4 = await cdp.json(
    `
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await s.openPath(${J(FILE)});
    await wait(3500);

    const hitung = EX.hitung();
    const pertama = EX.swatchPertama();

    // Unicode ambigu ada di dekat AKHIR file; dekorasi hanya digambar untuk
    // VIEWPORT (itu keputusan performa fase 24), jadi barisnya harus benar-benar
    // ditampilkan dulu. Menghitung tanpa scroll = menguji hal yang salah.
    const cm0 = window.__ZEPHYR_CM__();
    const barisUni =
      cm0.state.doc.toString().split('\\n').findIndex((l) => l.includes('export const pesan')) + 1;
    const posUni = cm0.state.doc.line(barisUni).from;
    cm0.dispatch({ selection: { anchor: posUni } });
    cm0.scrollDOM.scrollTop = cm0.lineBlockAt(posUni).top;
    await wait(900);
    const unicodeSetelahScroll = EX.hitung().unicode;

    // Kembali ke atas supaya swatch #ff0000 (baris 3) terlihat lagi.
    cm0.scrollDOM.scrollTop = 0;
    await wait(700);

    const cm = window.__ZEPHYR_CM__();
    const sebelum = cm.state.doc.toString();
    const adaMerahSebelum = sebelum.includes('"#ff0000"');

    // Ubah lewat <input type="color"> ASLI (jalur yang dipakai user).
    const ok = EX.ubahWarna('#00ff88');
    await wait(900);

    const cm2 = window.__ZEPHYR_CM__();
    const sesudah = cm2.state.doc.toString();
    const teksBerubah = sesudah.includes('"#00ff88"') && !sesudah.includes('"#ff0000"');
    // Tab kotor = perubahan lewat transaksi CodeMirror (masuk undo history),
    // bukan tulis-paksa di luar state editor.
    const kotor = S.getState().tabs.find((t) => t.id === S.getState().activeTabId).unsaved;
    const swatchBaru = EX.swatchPertama();

    // Command "Color: Document Colors" harus melaporkan warna dokumen.
    window.__ZEPHYR_NOTIF__.clear();
    await window.__ZEPHYR_NOTIF__.run('editor.documentColors');
    await wait(600);
    const notif = window.__ZEPHYR_NOTIF__.items().slice(-1)[0] || null;

    return JSON.stringify({
      swatch: hitung.swatch, unicode: hitung.unicode, unicodeSetelahScroll, barisUni,
      pertama, adaMerahSebelum, ok, teksBerubah, kotor,
      swatchBaru, notifMsg: notif ? notif.message : null,
    });
  `,
    150000,
  );
  check(
    'V4',
    v4.swatch === 3 &&
      v4.unicodeSetelahScroll === 1 &&
      v4.pertama?.warna === '#ff0000' &&
      v4.pertama?.bg === 'rgb(255, 0, 0)' &&
      v4.pertama?.adaInput === true &&
      v4.adaMerahSebelum &&
      v4.ok &&
      v4.teksBerubah &&
      v4.kotor === true &&
      v4.swatchBaru?.warna === '#00ff88' &&
      /3 warna/.test(v4.notifMsg ?? ''),
    `${v4.swatch} swatch dirender untuk 3 format berbeda (#hex, rgb(), hsl()) — yang pertama ` +
      `data-color="${v4.pertama?.warna}" dengan background nyata ${v4.pertama?.bg} dan ` +
      `<input type="color"> asli di dalamnya (${v4.pertama?.adaInput}). Ubah ke #00ff88 lewat ` +
      `input itu → TEKS DOKUMEN berubah (${v4.teksBerubah}), tab jadi kotor (${v4.kotor}, ` +
      `artinya lewat transaksi CodeMirror + undo history), swatch ikut jadi ` +
      `"${v4.swatchBaru?.warna}". Command Document Colors: "${v4.notifMsg}". ` +
      `Unicode U+2019 di baris ${v4.barisUni}: ${v4.unicode} node sebelum di-scroll ke sana, ` +
      `${v4.unicodeSetelahScroll} setelah baris itu masuk viewport — dekorasi memang hanya ` +
      `digambar untuk viewport (keputusan performa), dan itu terbukti bekerja`,
  );

  // ═════════ V5: bracket colorization + Ctrl+D + Alt+Up + Shift+Ctrl+K ═════════
  // Siapkan: buka file, seleksi kata "kata", fokuskan editor.
  const siap = await cdp.json(
    `
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await s.openPath(${J(FILE)});
    await wait(3200);

    const hitung = EX.hitung();
    const warna = EX.warnaBracket();

    const cm = window.__ZEPHYR_CM__();
    const teks = cm.state.doc.toString().split('\\n');
    const barisKata = teks.findIndex((l) => l.includes('const kata = "ulang"')) + 1;
    const line = cm.state.doc.line(barisKata);
    const kol = line.text.indexOf('kata');
    cm.dispatch({ selection: { anchor: line.from + kol, head: line.from + kol + 4 } });
    cm.focus();
    await wait(300);

    return JSON.stringify({
      bracket: hitung.bracket, indentGuide: hitung.indentGuide, warna,
      barisKata,
      selAwal: cm.state.selection.ranges.length,
      fokus: document.activeElement ? document.activeElement.className : null,
    });
  `,
    120000,
  );

  // Ctrl+D dua kali dari keyboard NYATA.
  await tekan(cdp, { key: 'd', code: 'KeyD', vk: 68, modifiers: CTRL });
  const sel2 = await cdp.eval('window.__ZEPHYR_CM__().state.selection.ranges.length');
  await tekan(cdp, { key: 'd', code: 'KeyD', vk: 68, modifiers: CTRL });
  const sel3 = await cdp.eval('window.__ZEPHYR_CM__().state.selection.ranges.length');

  // Siapkan Alt+Up: kursor di baris "const lain = kata".
  const siapPindah = await cdp.json(
    `
    const cm = window.__ZEPHYR_CM__();
    const teks = cm.state.doc.toString().split('\\n');
    const barisLain = teks.findIndex((l) => l.includes('const lain = kata')) + 1;
    const l = cm.state.doc.line(barisLain);
    cm.dispatch({ selection: { anchor: l.from } });
    cm.focus();
    await wait(250);
    return JSON.stringify({
      barisLain,
      isiLain: cm.state.doc.line(barisLain).text.trim(),
      isiAtas: cm.state.doc.line(barisLain - 1).text.trim(),
      jmlBaris: cm.state.doc.lines,
    });
  `,
    60000,
  );

  await tekan(cdp, { key: 'ArrowUp', code: 'ArrowUp', vk: 38, modifiers: ALT });

  const setelahPindah = await cdp.json(
    `
    const cm = window.__ZEPHYR_CM__();
    const n = ${siapPindah.barisLain};
    return JSON.stringify({
      atas: cm.state.doc.line(n - 1).text.trim(),
      bawah: cm.state.doc.line(n).text.trim(),
      jmlBaris: cm.state.doc.lines,
    });
  `,
    60000,
  );

  // Shift+Ctrl+K = hapus baris.
  await tekan(cdp, { key: 'K', code: 'KeyK', vk: 75, modifiers: CTRL | SHIFT });
  const setelahHapus = await cdp.eval('window.__ZEPHYR_CM__().state.doc.lines');

  const warnaUnik = [...new Set((siap.warna ?? []).filter(Boolean))];
  const pindahOk =
    setelahPindah.atas === siapPindah.isiLain && setelahPindah.bawah === siapPindah.isiAtas;
  check(
    'V5',
    siap.bracket >= 10 &&
      warnaUnik.length >= 4 &&
      siap.indentGuide >= 5 &&
      siap.selAwal === 1 &&
      sel2 === 2 &&
      sel3 === 3 &&
      pindahOk &&
      setelahHapus === setelahPindah.jmlBaris - 1,
    `${siap.bracket} bracket diwarnai ${warnaUnik.length} warna berbeda menurut kedalaman ` +
      `(${J(warnaUnik.slice(0, 4))}); ${siap.indentGuide} baris punya indent guide. ` +
      `Ctrl+D dari pipa input WebView2 (bukan panggilan command): 1 → ${sel2} → ${sel3} cursor. ` +
      `Alt+Up di baris ${siapPindah.barisLain}: "${siapPindah.isiLain}" dan ` +
      `"${siapPindah.isiAtas}" benar-benar bertukar (${pindahOk}). ` +
      `Shift+Ctrl+K: ${setelahPindah.jmlBaris} → ${setelahHapus} baris`,
  );

  // ═════════ V6: toggle Settings & menu View + persist ke disk ═════════
  const v6 = await cdp.json(
    `
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await s.openPath(${J(FILE)});
    await wait(2800);

    const bacaSet = () => {
      const e = S.getState().settings.editor;
      return { breadcrumbs: e.breadcrumbs, minimap: e.minimap, stickyScroll: e.stickyScroll,
               indentGuides: e.indentGuides, colorDecorators: e.colorDecorators,
               unicodeHighlight: e.unicodeHighlight,
               bracketPairColorization: e.bracketPairColorization };
    };
    const jalankan = (id) => window.__ZEPHYR_NOTIF__.run(id);

    const awalSet = bacaSet();
    const awalAda = EX.ada();
    const awalHitung = EX.hitung();

    // 1) Matikan lewat COMMAND (item menu View memakai command yang sama).
    await jalankan('editor.breadcrumbs.toggle');
    await jalankan('editor.minimap.toggle');
    await jalankan('editor.indentGuides.toggle');
    await jalankan('editor.colorDecorators.toggle');
    await jalankan('editor.unicodeHighlight.toggle');
    await jalankan('editor.bracketPairColorization.toggle');
    await wait(1400);

    const matiSet = bacaSet();
    const matiAda = EX.ada();
    const matiHitung = EX.hitung();

    // 2) Nilai harus SUDAH tersimpan ke disk, bukan hanya di state React.
    const dariDisk = await window.__ZEPHYR_SET__.settingsFromDisk();
    const diskEditor = {
      breadcrumbs: dariDisk.editor.breadcrumbs, minimap: dariDisk.editor.minimap,
      indentGuides: dariDisk.editor.indentGuides,
      colorDecorators: dariDisk.editor.colorDecorators,
      unicodeHighlight: dariDisk.editor.unicodeHighlight,
      bracketPairColorization: dariDisk.editor.bracketPairColorization,
    };

    // 3) Nyalakan lagi lewat TOGGLE UI di halaman Settings (bukan command).
    S.getState().setSettingsOpen(true);
    window.__ZEPHYR_SET__.ui.getState().setSection('editor');
    await wait(800);
    const tombol = q('[data-testid="editor-breadcrumbs"]');
    const ariaSebelum = tombol ? tombol.getAttribute('aria-checked') : null;
    if (tombol) tombol.click();
    await wait(800);
    const tombol2 = q('[data-testid="editor-breadcrumbs"]');
    const ariaSesudah = tombol2 ? tombol2.getAttribute('aria-checked') : null;
    const setelahKlikUI = bacaSet();

    // Baris UI untuk SEMUA kunci baru harus ada (UI-nya lengkap).
    const idUI = ['editor-breadcrumbs','editor-sticky','editor-sticky-max','editor-minimap',
      'editor-minimap-chars','editor-indent-guides','editor-color-dec','editor-unicode',
      'editor-bracket-color'];
    const barisUI = idUI.map((id) => !!q('[data-testid="' + id + '"]'));

    S.getState().setSettingsOpen(false);
    await wait(600);
    const kembaliAda = EX.ada();

    // 4) Menu View → Appearance benar-benar menunjuk command TERDAFTAR.
    const menuIds = ['editor.breadcrumbs.toggle','editor.stickyScroll.toggle',
      'editor.minimap.toggle','editor.indentGuides.toggle','editor.colorDecorators.toggle',
      'editor.unicodeHighlight.toggle','editor.bracketPairColorization.toggle'];
    const menus = window.__ZEPHYR_KB__.menu();
    const view = menus.find((m) => m.label.replace('&','') === 'View');
    const appearance = view ? view.items.find((i) => i.label === 'Appearance') : null;
    const anak = appearance && appearance.children ? appearance.children : [];
    const anakCmd = anak.map((c) => c.command).filter(Boolean);
    const semuaDiMenu = menuIds.every((id) => anakCmd.includes(id));
    const semuaPunyaCmd = anak.filter((c) => menuIds.includes(c.command))
                              .every((c) => c.hasCommand === true);

    return JSON.stringify({
      awalSet, awalAda, awalHitung, matiSet, matiAda, matiHitung, diskEditor,
      ariaSebelum, ariaSesudah, setelahKlikUI, barisUI, kembaliAda,
      anakCmd, semuaDiMenu, semuaPunyaCmd,
    });
  `,
    180000,
  );
  const matiSemua = Object.values(v6.matiSet ?? {}).filter((x) => x === false).length;
  check(
    'V6',
    v6.awalAda.breadcrumbs &&
      v6.awalAda.minimap &&
      v6.awalHitung.indentGuide > 0 &&
      v6.awalHitung.swatch > 0 &&
      v6.matiAda.breadcrumbs === false &&
      v6.matiAda.minimap === false &&
      v6.matiHitung.indentGuide === 0 &&
      v6.matiHitung.swatch === 0 &&
      v6.matiHitung.bracket === 0 &&
      v6.matiHitung.unicode === 0 &&
      v6.diskEditor.breadcrumbs === false &&
      v6.diskEditor.minimap === false &&
      v6.diskEditor.indentGuides === false &&
      v6.ariaSebelum === 'false' &&
      v6.ariaSesudah === 'true' &&
      v6.setelahKlikUI.breadcrumbs === true &&
      v6.kembaliAda.breadcrumbs === true &&
      v6.barisUI.every(Boolean) &&
      v6.semuaDiMenu &&
      v6.semuaPunyaCmd,
    `Semua ON: breadcrumbs+minimap dirender, ${v6.awalHitung.indentGuide} indent guide, ` +
      `${v6.awalHitung.swatch} swatch, ${v6.awalHitung.bracket} bracket. 6 command toggle ` +
      `dijalankan → ${matiSemua} setting false dan DOM benar-benar bersih (breadcrumbs ` +
      `${v6.matiAda.breadcrumbs}, minimap ${v6.matiAda.minimap}, guide ` +
      `${v6.matiHitung.indentGuide}, swatch ${v6.matiHitung.swatch}, bracket ` +
      `${v6.matiHitung.bracket}, unicode ${v6.matiHitung.unicode}) — dilepas, bukan disembunyikan. ` +
      `PERSIST: get_settings dari DISK membaca breadcrumbs=${v6.diskEditor.breadcrumbs}, ` +
      `minimap=${v6.diskEditor.minimap}, indentGuides=${v6.diskEditor.indentGuides}. ` +
      `Klik toggle UI Settings: aria-checked ${v6.ariaSebelum} → ${v6.ariaSesudah}, ` +
      `breadcrumbs dirender lagi (${v6.kembaliAda.breadcrumbs}); ` +
      `${v6.barisUI.filter(Boolean).length}/9 baris setting ada. ` +
      `Menu View → Appearance: ${v6.anakCmd.length} item, ke-7 command extras ada semua ` +
      `(${v6.semuaDiMenu}) dan semuanya terdaftar di registry (${v6.semuaPunyaCmd})`,
  );
};
