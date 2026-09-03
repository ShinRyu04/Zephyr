// v18/bagian1.mjs — V1..V3: menu bar tampil, keyboard nav, accelerator palette.

export const bagian1 = async (cdp, check) => {
  // ═════════ V1: menu bar + dropdown + accelerator ═════════
  const v1 = await cdp.json(
    `
    const bar = q('[data-testid="menubar"]');
    const tops = qa('[data-testid="mb-top"]').map((b) => b.dataset.menu);
    // Klik File → dropdown terbuka.
    const fileBtn = qa('[data-testid="mb-top"]').find((b) => b.dataset.menu === 'File');
    fileBtn.click();
    await wait(250);
    const dd = q('[data-testid="mb-dropdown"]');
    const items = qa('[data-testid="mb-dropdown"] [data-testid="mb-item"]').map((b) => ({
      cmd: b.dataset.command,
      chord: b.dataset.chord || '',
      disabled: b.dataset.disabled === '1',
      label: b.querySelector('.mb-label') ? b.querySelector('.mb-label').textContent : '',
    }));
    const chordSave = items.find((i) => i.cmd === 'file.save');
    const chordNew = items.find((i) => i.cmd === 'file.new');
    // Esc menutup.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(200);
    const tertutup = !q('[data-testid="mb-dropdown"]');
    return JSON.stringify({
      adaBar: !!bar, role: bar ? bar.getAttribute('role') : null,
      tops, adaDropdown: !!dd, jmlItem: items.length,
      chordSave: chordSave ? chordSave.chord : null,
      chordNew: chordNew ? chordNew.chord : null,
      tertutup,
    });
  `,
    40000,
  );
  check(
    'V1',
    v1.adaBar &&
      v1.role === 'menubar' &&
      v1.tops.length === 8 &&
      v1.adaDropdown &&
      v1.jmlItem >= 12 &&
      v1.chordSave === 'Ctrl+S' &&
      v1.chordNew === 'Ctrl+N' &&
      v1.tertutup,
    `menu bar role="menubar" dengan ${v1.tops.length} menu (${v1.tops.join(', ')}); ` +
      `klik File → ${v1.jmlItem} item, accelerator Save=${v1.chordSave} New=${v1.chordNew}; ` +
      `Esc menutup dropdown (${v1.tertutup})`,
  );

  // ═════════ V2: Alt mnemonic + navigasi panah + Enter ═════════
  const v2 = await cdp.json(
    `
    const KB = window.__ZEPHYR_KB__;
    KB.setLastRun(null);
    // Alt ditekan → mnemonic digarisbawahi.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true }));
    await wait(200);
    const adaUnderline = qa('[data-testid="mb-top"] u').length;
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
    await wait(150);

    // Alt+V membuka menu View.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', altKey: true, bubbles: true, cancelable: true }));
    await wait(300);
    const menuTerbuka = qa('[data-testid="mb-top"]').find((b) => b.getAttribute('aria-expanded') === 'true');
    const labelTerbuka = menuTerbuka ? menuTerbuka.dataset.menu : null;
    const aktifAwal = q('[data-testid="mb-dropdown"] .mb-item.is-active');
    const labelAwal = aktifAwal ? aktifAwal.querySelector('.mb-label').textContent : null;

    // Panah bawah 2x lalu cek item aktif berpindah.
    for (let i = 0; i < 2; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await wait(120);
    }
    const aktif2 = q('[data-testid="mb-dropdown"] .mb-item.is-active');
    const labelAktif2 = aktif2 ? aktif2.querySelector('.mb-label').textContent : null;
    const cmdAktif2 = aktif2 ? aktif2.dataset.command : null;

    // Esc menutup tanpa menjalankan apa pun.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(200);
    const tertutup = !q('[data-testid="mb-dropdown"]');
    const lastRun = KB.lastRun();
    return JSON.stringify({ adaUnderline, labelTerbuka, labelAwal, labelAktif2, cmdAktif2, tertutup, lastRun });
  `,
    40000,
  );
  check(
    'V2',
    v2.adaUnderline === 8 &&
      v2.labelTerbuka === 'View' &&
      v2.labelAktif2 !== v2.labelAwal &&
      v2.tertutup &&
      v2.lastRun === null,
    `Alt menyorot ${v2.adaUnderline} mnemonic; Alt+V membuka "${v2.labelTerbuka}"; ` +
      `panah↓×2 memindah item aktif "${v2.labelAwal}" → "${v2.labelAktif2}" (${v2.cmdAktif2}); ` +
      `Esc menutup tanpa menjalankan command (lastRun=${v2.lastRun})`,
  );

  // ═════════ V3: accelerator tampil di palette ═════════
  const v3 = await cdp.json(
    `
    // CP/q/qa/wait sudah disediakan prelude lib-cdp.mjs — JANGAN dideklarasikan
    // ulang, itu bikin "Identifier 'CP' has already been declared".
    //
    // Tab harus KOTOR dulu: file.saveAll punya enabled() = ada tab unsaved,
    // jadi tanpa ini ia tersaring dari palette dan uji "sequence tampil"
    // gagal padahal accelerator-nya benar.
    const cm = window.__ZEPHYR_CM__();
    if (cm) {
      cm.dispatch({ changes: { from: cm.state.doc.length, insert: '\\n// v18\\n' } });
      await wait(400);
    }
    const adaKotor = S.getState().tabs.some((t) => t.unsaved);
    await CP.open('command');
    await wait(400);
    await CP.setQuery('save');
    await wait(400);
    const baris = qa('[data-testid="cp-row"]').slice(0, 8).map((r) => ({
      id: r.dataset.cpId,
      kbd: r.querySelector('.cp-kbd') ? r.querySelector('.cp-kbd').textContent : null,
    }));
    await CP.setQuery('terminal');
    await wait(400);
    const barisTerm = qa('[data-testid="cp-row"]').slice(0, 6).map((r) => ({
      id: r.dataset.cpId,
      kbd: r.querySelector('.cp-kbd') ? r.querySelector('.cp-kbd').textContent : null,
    }));
    await CP.close();
    await wait(200);
    return JSON.stringify({ baris, barisTerm, adaKotor });
  `,
    40000,
  );
  const kbdSave = v3.baris.find((b) => b.id === 'file.save');
  const kbdSaveAll = v3.baris.find((b) => b.id === 'file.saveAll');
  const kbdTermBaru = v3.barisTerm.find((b) => b.id === 'terminal.new');
  check(
    'V3',
    v3.adaKotor &&
      !!kbdSave &&
      kbdSave.kbd === 'Ctrl+S' &&
      !!kbdSaveAll &&
      kbdSaveAll.kbd === 'Ctrl+K S' &&
      !!kbdTermBaru &&
      !!kbdTermBaru.kbd,
    `palette menampilkan accelerator dari registry: file.save=${kbdSave ? kbdSave.kbd : '—'}, ` +
      `file.saveAll=${kbdSaveAll ? kbdSaveAll.kbd : '—'} (sequence), ` +
      `terminal.new=${kbdTermBaru ? kbdTermBaru.kbd : '—'}`,
  );
};
