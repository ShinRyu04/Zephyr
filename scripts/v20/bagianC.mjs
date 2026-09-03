// v20/bagianC.mjs — V7..V9: Debug Console REPL, lazy mount, menu View.

export const bagianC = async (cdp, check) => {
  // ═════════ V7: Debug Console REPL no-op → channel "debug" ═════════
  const v7 = await cdp.json(
    `
    const P = window.__ZEPHYR_PANEL__;
    P.output.clear('debug');
    P.focusTab('debug');
    await wait(500);
    const adaEmptyAwal = !!q('[data-testid="dc-empty"]');

    // Kirim lewat UI, bukan panggil fungsi langsung.
    const inp = q('[data-testid="dc-input"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '1 + 1');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(200);
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(600);

    const barisDc = qa('[data-testid="dc-line"]').map((d) => d.textContent);
    const totalDebug = P.output.lines('debug');
    const tail = P.output.tail('debug', 3);
    const inputKosong = inp.value === '';

    // Riwayat: panah atas mengembalikan ekspresi terakhir.
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await wait(300);
    const setelahPanah = inp.value;

    // Channel Output "debug" berisi hal yang sama.
    P.focusTab('output');
    P.output.setChannel('debug');
    await wait(500);
    const barisOv = qa('[data-testid="ov-line"]').map((d) => d.textContent);
    return JSON.stringify({ adaEmptyAwal, barisDc, totalDebug, tail, inputKosong, setelahPanah, barisOv });
  `,
    60000,
  );
  check(
    'V7',
    v7.adaEmptyAwal &&
      v7.totalDebug === 2 &&
      v7.barisDc.some((l) => l.includes('> 1 + 1')) &&
      v7.barisDc.some((l) => l.includes('fase 22')) &&
      v7.inputKosong &&
      v7.setelahPanah === '1 + 1' &&
      v7.barisOv.some((l) => l.includes('> 1 + 1')),
    `Debug Console kosong di awal; kirim "1 + 1" lewat input → ${v7.totalDebug} baris tercatat ` +
      `("${v7.tail[0]}" / "${(v7.tail[1] ?? '').slice(0, 46)}…"); input dikosongkan, panah↑ ` +
      `mengembalikan "${v7.setelahPanah}"; baris yang sama tampil di channel Output "debug" ` +
      `(${v7.barisOv.length} baris) — jalur inilah yang diganti fase 22 dengan DAP`,
  );

  // ═════════ V8: hanya tab aktif mounted ═════════
  const v8 = await cdp.json(
    `
    const P = window.__ZEPHYR_PANEL__;
    const cek = () => ({
      problems: !!q('[data-testid="problems-view"]'),
      output: !!q('[data-testid="output-view"]'),
      debug: !!q('[data-testid="debug-console-view"]'),
      ports: !!q('[data-testid="ports-view"]'),
      termHost: !!q('[data-testid="panel-term-host"]'),
      termDisplay: q('[data-testid="panel-term-host"]')
        ? getComputedStyle(q('[data-testid="panel-term-host"]')).display : null,
    });

    P.focusTab('problems');
    await wait(450);
    const diProblems = cek();
    P.focusTab('output');
    await wait(450);
    const diOutput = cek();
    P.focusTab('ports');
    await wait(450);
    const diPorts = cek();
    P.focusTab('terminal');
    await wait(450);
    const diTerminal = cek();

    // Menu "..." menyembunyikan tab. JANGAN klik tombolnya dua kali untuk
    // membuka ulang — tombolnya TOGGLE, jadi klik kedua justru menutup dan
    // querySelector item mengembalikan undefined (pelajaran fase 13:
    // tombol Marketplace juga toggle).
    P.menuOpen(true);
    await wait(350);
    const itemMenu = qa('[data-testid="pts-menu-item"]').length;
    const itemPorts = qa('[data-testid="pts-menu-item"]').find((b) => b.dataset.tab === 'ports');
    if (!itemPorts) return JSON.stringify({ gagal: 'item menu ports tidak ada; menu terbuka? ' + itemMenu });
    itemPorts.click();
    await wait(450);
    const tabTampil = qa('[data-testid="pts-tab"]').map((b) => b.dataset.tab);
    const visibleStore = P.visibleTabs();

    // Kembalikan: buka menu lagi lewat state, bukan klik toggle.
    P.menuOpen(true);
    await wait(300);
    const itemPorts2 = qa('[data-testid="pts-menu-item"]').find((b) => b.dataset.tab === 'ports');
    if (itemPorts2) itemPorts2.click();
    await wait(450);
    P.menuOpen(false);
    await wait(200);

    const ram = s.ramBytes;
    return JSON.stringify({
      diProblems, diOutput, diPorts, diTerminal, itemMenu, tabTampil, visibleStore,
      ramMB: ram && Number.isFinite(ram) ? Math.round(ram / 1024 / 1024) : null,
      tabAkhir: qa('[data-testid="pts-tab"]').length,
    });
  `,
    90000,
  );
  const hanyaSatu = (o, aktif) =>
    ['problems', 'output', 'debug', 'ports'].every((k) => (k === aktif ? o[k] : !o[k]));
  check(
    'V8',
    !v8.gagal &&
      hanyaSatu(v8.diProblems, 'problems') &&
      hanyaSatu(v8.diOutput, 'output') &&
      hanyaSatu(v8.diPorts, 'ports') &&
      v8.diTerminal.termDisplay === 'flex' &&
      v8.diProblems.termDisplay === 'none' &&
      v8.itemMenu === 5 &&
      !v8.tabTampil.includes('ports') &&
      !v8.visibleStore.includes('ports') &&
      v8.tabAkhir === 5 &&
      (v8.ramMB === null || v8.ramMB < 400),
    `tab non-aktif benar-benar UNMOUNT: di Problems hanya problems-view ada, di Output hanya ` +
      `output-view, di Ports hanya ports-view. Holder terminal tetap di DOM tapi ` +
      `display:none saat tab lain (${v8.diProblems.termDisplay}) → flex saat aktif ` +
      `(${v8.diTerminal.termDisplay}). Menu "…" berisi ${v8.itemMenu} tab; sembunyikan Ports → ` +
      `strip jadi [${v8.tabTampil.join(', ')}], dikembalikan jadi ${v8.tabAkhir} tab. ` +
      `RAM ${v8.ramMB ?? '—'} MB (target < 400)`,
  );

  // ═════════ V9: menu View = command yang sama dengan shortcut ═════════
  const v9 = await cdp.json(
    `
    const P = window.__ZEPHYR_PANEL__;
    const KB = window.__ZEPHYR_KB__;
    const menu = KB.menu().find((m) => m.label === 'View');
    const itemPanel = menu.items.filter((i) => i.command && (
      i.command.startsWith('workbench.action.') ||
      i.command.endsWith('Panel.focus')
    )).map((i) => ({ label: i.label, cmd: i.command, ada: i.hasCommand }));

    // Chord dan menu harus menunjuk command yang SAMA.
    const pasangan = [
      ['Ctrl+Shift+M', 'problemsPanel.focus'],
      ['Ctrl+Shift+U', 'outputPanel.focus'],
      ['Ctrl+Shift+Y', 'debugConsolePanel.focus'],
      ['Ctrl+J', 'workbench.action.togglePanel'],
      ['Ctrl+\`', 'terminalPanel.focus'],
    ].map(([chord, cmd]) => {
      const hit = KB.resolve(chord);
      return { chord, diminta: cmd, dariChord: hit ? hit.command : null };
    });

    // Klik item menu Problems benar-benar memindah tab.
    P.focusTab('terminal');
    await wait(300);
    qa('[data-testid="mb-top"]').find((b) => b.dataset.menu === 'View').click();
    await wait(350);
    const item = qa('[data-testid="mb-item"]').find((b) => b.dataset.command === 'problemsPanel.focus');
    const chordDiMenu = item ? item.dataset.chord : null;
    item.click();
    await wait(600);
    const tabSetelahKlik = P.activeTab();

    // Shortcut menghasilkan hal yang sama.
    P.focusTab('terminal');
    await wait(300);
    KB.press('Ctrl+Shift+M');
    await wait(600);
    const tabSetelahChord = P.activeTab();

    // Ctrl+PageDown memutar tab.
    const sebelumCycle = P.activeTab();
    KB.press('Ctrl+PageDown');
    await wait(500);
    const setelahCycle = P.activeTab();

    return JSON.stringify({
      itemPanel, pasangan, chordDiMenu, tabSetelahKlik, tabSetelahChord,
      sebelumCycle, setelahCycle,
    });
  `,
    90000,
  );
  const semuaCocok = v9.pasangan.every((p) => p.dariChord === p.diminta);
  const semuaAda = v9.itemPanel.every((i) => i.ada);
  check(
    'V9',
    semuaCocok &&
      semuaAda &&
      v9.itemPanel.length >= 6 &&
      v9.chordDiMenu === 'Ctrl+Shift+M' &&
      v9.tabSetelahKlik === 'problems' &&
      v9.tabSetelahChord === 'problems' &&
      v9.setelahCycle !== v9.sebelumCycle,
    `${v9.itemPanel.length} item menu View menunjuk command panel dan SEMUANYA terdaftar; ` +
      `5 pasangan chord↔command cocok (${v9.pasangan.map((p) => `${p.chord}→${p.dariChord}`).join(', ')}); ` +
      `klik menu Problems (accelerator ${v9.chordDiMenu}) → tab ${v9.tabSetelahKlik}, ` +
      `Ctrl+Shift+M → tab ${v9.tabSetelahChord} (jalur sama); ` +
      `Ctrl+PageDown memutar ${v9.sebelumCycle} → ${v9.setelahCycle}`,
  );
};
