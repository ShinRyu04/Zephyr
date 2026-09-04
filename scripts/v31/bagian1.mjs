// v31/bagian1.mjs — V2 (keyboard-only + focus trap) & V3 (pohon aksesibilitas).
//
// PERINGATAN PERMANEN: JANGAN pakai backtick di komentar DI DALAM template
// literal — template tertutup lebih awal dan node --check tetap lolos.

const J = (s) => JSON.stringify(s);

export const bagian1 = async (cdp, check, F) => {
  // ═════════ V2: navigasi penuh tanpa mouse ═════════
  //
  // Semua langkah memakai KEYBOARD lewat CDP Input.dispatchKeyEvent (bukan
  // memanggil store), karena yang diuji justru apakah jalur keyboard-nya ada.
  const kirimKey = async (key, code, mods = 0, teks) => {
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', {
        type: type === 'keyDown' && teks ? 'keyDown' : type,
        key,
        code,
        modifiers: mods,
        ...(teks ? { text: teks } : {}),
      });
    }
  };

  // Ctrl+Shift+P → palette mode command
  await kirimKey('P', 'KeyP', 2 | 8);
  await cdp.eval('new Promise(r => setTimeout(r, 400))');
  const paletteTerbuka = await cdp.json(`
    const modal = q('[data-testid="cp-modal"]');
    return JSON.stringify({
      ada: !!modal,
      mode: modal ? modal.getAttribute('data-mode') : null,
      fokus: AY.fokus(),
    })
  `);

  // Esc lalu Ctrl+P → palette mode file, ketik nama file, Enter
  await kirimKey('Escape', 'Escape');
  await cdp.eval('new Promise(r => setTimeout(r, 250))');
  await kirimKey('P', 'KeyP', 2);
  await cdp.eval('new Promise(r => setTimeout(r, 500))');
  for (const c of 'a11y-target') await kirimKey(c, `Key${c.toUpperCase()}`, 0, c);
  await cdp.eval('new Promise(r => setTimeout(r, 700))');

  const sebelumEnter = await cdp.json(`
    // POLLING, bukan sekali baca: daftar file palette dimuat ASYNC dari Rust
    // (listWorkspaceFiles), jadi 700ms kadang cukup kadang tidak — gagalnya
    // acak dan menyesatkan ("0 item" padahal Enter tetap membuka file).
    let items = [];
    let mode = null;
    for (let i = 0; i < 40; i++) {
      const modal = q('[data-testid="cp-modal"]');
      mode = modal ? modal.getAttribute('data-mode') : null;
      items = qa('[data-testid="cp-list"] [role="option"]');
      if (items.length > 0) break;
      await wait(200);
    }
    return JSON.stringify({
      mode,
      jumlahItem: items.length,
      itemPertama: items[0] ? items[0].textContent.trim().slice(0, 40) : null,
    })
  `);

  await kirimKey('Enter', 'Enter');
  await cdp.eval('new Promise(r => setTimeout(r, 900))');

  const v2a = await cdp.json(`
    // POLLING, bukan satu kali baca: openPath membaca file dari disk lewat
    // Rust, dan 900ms tidak selalu cukup di mesin yang sibuk. Sekali-baca
    // membuat uji ini gagal acak (sudah kena: tab=null padahal tabnya terbuka).
    let tab = null;
    for (let i = 0; i < 30; i++) {
      const st = S.getState();
      tab = st.tabs.find((t) => t.id === st.activeTabId) || null;
      if (tab) break;
      await wait(200);
    }
    return JSON.stringify({
      tabAda: !!tab,
      namaTab: tab ? tab.name : null,
      jumlahTab: S.getState().tabs.length,
      paletteTutup: !q('[data-testid="cp-modal"]'),
    })
  `);

  // Skip link: elemen fokusabel pertama, memindahkan fokus ke editor.
  const v2b = await cdp.json(`
    const skip = q('[data-testid="a11y-skip"]');
    if (!skip) return JSON.stringify({ err: 'skip link tidak ada' });
    // Urutan DOM: skip link harus mendahului MenuBar & ActivityBar.
    const semua = qa('button, a[href], input, [tabindex]:not([tabindex="-1"])');
    const indexSkip = semua.indexOf(skip);
    skip.focus();
    const fokusSkip = AY.fokus();
    skip.click();
    await wait(300);
    const fokusSetelah = AY.fokus();
    return JSON.stringify({
      indexSkip,
      totalFokusabel: semua.length,
      fokusSkip,
      fokusSetelah,
      diEditor: !!(fokusSetelah && String(fokusSetelah.cls || '').includes('cm-content')),
    })
  `);

  // Focus trap: buka dialog (tab kotor → ConfirmDialog), Tab harus berputar
  // di dalam dialog dan TIDAK keluar.
  const v2c = await cdp.json(`
    const st = S.getState();
    const tab = st.tabs.find((t) => t.id === st.activeTabId);
    if (!tab) return JSON.stringify({ err: 'tidak ada tab' });

    // Buat tab kotor supaya dialog konfirmasi muncul saat ditutup.
    //
    // Dipakai requestCloseTab (BUKAN closeTab — nama itu tidak ada di store):
    // ia yang memeriksa tab kotor lalu memunculkan ConfirmDialog. Sedangkan
    // forceCloseTab menutup tanpa bertanya, jadi tidak ada dialog untuk diuji.
    //
    // CATATAN: JANGAN pakai backtick di komentar ini — kita berada DI DALAM
    // template literal, dan backtick menutupnya lebih awal. Sudah kena 5 kali.
    st.updateTabContent(tab.id, '// diubah untuk uji focus trap\\n');
    await wait(250);
    st.requestCloseTab(tab.id);
    await wait(500);

    const dialog = AY.dialogAktif();
    if (dialog.length === 0) return JSON.stringify({ err: 'dialog tidak muncul', dialog });

    const fokusAwal = AY.fokus();
    // Tab beberapa kali: harus TETAP di dalam dialog.
    const jejak = [];
    for (let i = 0; i < 6; i++) {
      AY.tekanTab(false);
      await wait(90);
      const f = AY.fokus();
      jejak.push({ testid: f && f.testid, teks: f && f.teks, dalam: !!(f && f.diDalamDialog) });
    }
    // Shift+Tab juga harus tetap di dalam.
    AY.tekanTab(true);
    await wait(90);
    const setelahShift = AY.fokus();

    return JSON.stringify({
      dialog,
      fokusAwal,
      jejak,
      setelahShift,
      semuaDiDalam: jejak.every((x) => x.dalam) && !!(setelahShift && setelahShift.diDalamDialog),
    })
  `);

  // Bereskan dialog (jangan simpan) supaya uji berikutnya bersih.
  await cdp.json(`
    const st = S.getState();
    // 'discard' (BUKAN 'dont'): tanda tangan resolveConfirm adalah
    // 'save' | 'discard' | 'cancel'. Nilai tak dikenal membuat dialog
    // menggantung dan uji berikutnya menunggu selamanya.
    if (st.confirm) await st.resolveConfirm('discard');
    await wait(300);
    return JSON.stringify({ confirm: !!S.getState().confirm })
  `);

  // Panel Problems + Settings lewat keyboard (Ctrl+Shift+M, Ctrl+,).
  await kirimKey('M', 'KeyM', 2 | 8);
  await cdp.eval('new Promise(r => setTimeout(r, 450))');
  const v2d = await cdp.json(`
    // Bridge panel mengekspos GETTER, bukan store zustand mentah:
    // __ZEPHYR_PANEL__.store adalah store-nya, sedangkan activeTab()/visible()
    // adalah fungsi. Memanggil .getState() pada objek bridge melempar.
    const PB = window.__ZEPHYR_PANEL__;
    return JSON.stringify({
      panelTab: PB ? PB.activeTab() : null,
      panelVisible: PB ? PB.visible() : null,
      problemsAda: !!q('[data-testid="problems-view"]') || !!q('.problems'),
    })
  `);

  await kirimKey(',', 'Comma', 2);
  await cdp.eval('new Promise(r => setTimeout(r, 500))');
  const v2e = await cdp.json(`
    S.getState().setSettingsOpen(false);
    await wait(150);
    return JSON.stringify({ settingsPernahTerbuka: true })
  `);

  const v2ok =
    paletteTerbuka.ada === true &&
    paletteTerbuka.mode === 'command' &&
    sebelumEnter.mode === 'file' &&
    sebelumEnter.jumlahItem > 0 &&
    v2a.tabAda === true &&
    String(v2a.namaTab).includes('a11y-target') &&
    v2a.paletteTutup === true &&
    !v2b.err &&
    // Skip link WAJIB fokusabel pertama.
    v2b.indexSkip === 0 &&
    v2b.diEditor === true &&
    !v2c.err &&
    v2c.dialog.length > 0 &&
    // Inti V2: Tab & Shift+Tab tidak pernah keluar dari dialog.
    v2c.semuaDiDalam === true;
  check(
    'F31-V2',
    v2ok,
    v2c.err || v2b.err
      ? `${v2b.err ?? ''} ${v2c.err ?? ''}`.trim()
      : `palette=${paletteTerbuka.mode} file=${sebelumEnter.jumlahItem} item -> tab="${v2a.namaTab}" | ` +
        `skipLink index=${v2b.indexSkip}/${v2b.totalFokusabel} -> editor=${v2b.diEditor} | ` +
        `trap: ${v2c.dialog.length} dialog (${v2c.dialog[0] ? v2c.dialog[0].fokusabel : 0} fokusabel), ` +
        `6xTab+ShiftTab semua di dalam=${v2c.semuaDiDalam} | ` +
        `panel=${v2d.panelTab}/${v2d.panelVisible}`,
  );

  // ═════════ V3: pohon aksesibilitas (yang dibaca Narrator) ═════════
  //
  // CDP Accessibility.getFullAXTree memberi POHON YANG SAMA yang dipakai
  // screen reader Windows. Ini bukti terkuat yang bisa diotomasi; Narrator
  // sendiri tidak bisa didorong dari luar dan itu dinyatakan apa adanya.
  //
  // PRASYARAT: Explorer harus TERLIHAT dan satu file harus TERBUKA.
  //
  // Dua hal yang membuat V3 gagal padahal produknya benar:
  //   1. `role="tree"` hanya ada saat activity='explorer' + workspace terbuka;
  //      uji sebelumnya meninggalkan activity='settings'.
  //   2. V2 MENUTUP tab lewat uji focus trap (resolveConfirm discard), jadi
  //      tidak ada .cm-content dan node "Editor: ..." memang tidak ada.
  //      Dibuktikan lewat diag31b: begitu file dibuka, node-nya muncul dengan
  //      nama lengkap.
  await cdp.json(`
    const st = S.getState();
    st.setSettingsOpen(false);
    st.setActivity('explorer');
    if (!st.sidebarVisible) st.toggleSidebar();
    await st.openPath(${J(F.fileUji)});
    // Tunggu EditorView benar-benar terpasang, jangan tebak durasinya.
    let cm = 0;
    for (let i = 0; i < 30; i++) {
      cm = qa('.cm-content').length;
      if (cm > 0) break;
      await wait(200);
    }
    await wait(300);
    return JSON.stringify({
      activity: S.getState().activity,
      sidebarVisible: S.getState().sidebarVisible,
      tree: qa('[role="tree"]').length,
      treeitem: qa('[role="treeitem"]').length,
      cm,
    })
  `);

  await cdp.send('Accessibility.enable', {});
  const ax = await cdp.send('Accessibility.getFullAXTree', {});
  // `cdp.send()` mengembalikan PESAN CDP utuh, bukan hasilnya — node-nya ada
  // di `.result.nodes`. Membaca `ax.nodes` menghasilkan undefined dan uji
  // "lulus" dengan 0 node, yang justru menyembunyikan kegagalan.
  const nodes = (ax.result && ax.result.nodes) || [];

  const namaDari = (n) => (n.name && n.name.value ? String(n.name.value) : '');
  const roleDari = (n) => (n.role && n.role.value ? String(n.role.value) : '');
  const perRole = {};
  for (const n of nodes) {
    const r = roleDari(n);
    if (!r) continue;
    perRole[r] = (perRole[r] || 0) + 1;
  }

  // Elemen yang WAJIB punya nama aksesibel (kalau tidak, Narrator menyebutnya
  // "button" saja dan user tidak tahu fungsinya).
  const tanpaNama = nodes.filter(
    (n) =>
      ['button', 'link', 'textbox', 'checkbox', 'switch', 'tab'].includes(roleDari(n)) &&
      !namaDari(n).trim() &&
      !n.ignored,
  );

  const adaTree = nodes.some((n) => roleDari(n) === 'tree');
  const adaTablist = nodes.some((n) => roleDari(n) === 'tablist');
  const adaEditor = nodes.some((n) => namaDari(n).startsWith('Editor: '));
  const adaLive = nodes.some(
    (n) => roleDari(n) === 'status' || roleDari(n) === 'alert' || roleDari(n) === 'log',
  );
  const skipAx = nodes.find((n) => namaDari(n).includes('Lompat ke editor'));

  // Live region: umumkan lewat jalur produk, lalu baca isi DOM-nya.
  const v3live = await cdp.json(`
    AY.bersihkan();
    await wait(120);
    AY.umumkan('Uji pengumuman satu');
    await wait(220);
    const a = AY.isiLive();
    // Pesan SAMA dikirim dua kali: teks DOM harus tetap berubah, kalau tidak
    // screen reader mengabaikan pembacaan kedua.
    AY.umumkan('Uji pengumuman satu');
    await wait(220);
    const b = AY.isiLive();
    AY.umumkan('Uji error', 'assertive');
    await wait(220);
    const c = AY.isiLive();
    return JSON.stringify({
      a, b, c,
      berubah: a.polite !== b.polite,
      riwayat: AY.riwayat().length,
    })
  `);

  const v3ok =
    // Guard: pohon kosong berarti Accessibility.getFullAXTree gagal, dan
    // semua pemeriksaan di bawahnya jadi tidak bermakna.
    nodes.length > 20 &&
    adaTree &&
    adaTablist &&
    adaEditor &&
    adaLive &&
    !!skipAx &&
    tanpaNama.length === 0 &&
    v3live.a.politeAria === 'polite' &&
    v3live.c.assertiveAria === 'assertive' &&
    String(v3live.a.polite).includes('Uji pengumuman satu') &&
    // Pesan identik harus tetap mengubah DOM.
    v3live.berubah === true &&
    String(v3live.c.assertive).includes('Uji error');
  check(
    'F31-V3',
    v3ok,
    `AXTree ${nodes.length} node: tree=${adaTree} tablist=${adaTablist} editor=${adaEditor} ` +
      `live=${adaLive} skip=${!!skipAx} | tanpa nama=${tanpaNama.length}` +
      (tanpaNama.length
        ? ` (${tanpaNama
            .slice(0, 3)
            .map((n) => roleDari(n))
            .join(',')})`
        : '') +
      ` | live polite="${String(v3live.a.polite).slice(0, 24)}" berubah=${v3live.berubah} ` +
      `assertive="${String(v3live.c.assertive).slice(0, 18)}" | ` +
      `role: tab=${perRole.tab || 0} treeitem=${perRole.treeitem || 0} button=${perRole.button || 0}`,
  );
};
