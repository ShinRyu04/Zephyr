// v20/bagianB.mjs — V4..V6: Problems, Output 10k baris, Ports.

export const bagianB = async (cdp, check) => {
  // ═════════ V4: Problems + badge + status bar + klik ke lokasi ═════════
  const v4 = await cdp.json(
    `
    const P = window.__ZEPHYR_PANEL__;
    const file = 'D:/Zephyr/package.json';
    await s.openPath(file);
    await wait(700);
    const tabId = s.activeTabId;

    P.problems.clearAll();
    P.focusTab('problems');
    await wait(400);

    P.problems.set(file, [
      { file, line: 4, column: 3, severity: 'error', message: 'Uji error dari harness',
        source: 'harness', code: 'H001' },
      { file, line: 9, column: 5, severity: 'warning', message: 'Uji warning dari harness',
        source: 'harness', code: 'H002' },
    ]);
    await wait(500);

    const counts = P.problems.counts();
    const badgeErr = q('[data-testid="pts-badge-error"]');
    const badgeWarn = q('[data-testid="pts-badge-warn"]');
    const sbErr = q('[data-testid="sb-prob-errors"]');
    const sbWarn = q('[data-testid="sb-prob-warnings"]');
    const baris = qa('[data-testid="pv-row"]').map((r) => ({
      sev: r.dataset.severity,
      teks: r.querySelector('.pv-msg').textContent,
      loc: r.querySelector('.pv-loc').textContent,
    }));
    // Gutter marker di editor (bukan squiggle — itu fase 21).
    const marker = qa('.cm-diag-marker').length;

    // Filter teks menyaring.
    P.problems.setFilter('warning');
    await wait(400);
    const setelahFilter = qa('[data-testid="pv-row"]').length;
    P.problems.setFilter('');
    await wait(300);

    // Klik baris error → kursor pindah ke line 4.
    const rowError = qa('[data-testid="pv-row"]').find((r) => r.dataset.severity === 'error');
    rowError.click();
    await wait(900);
    const cm = window.__ZEPHYR_CM__();
    const kursor = cm ? cm.state.doc.lineAt(cm.state.selection.main.head).number : null;

    return JSON.stringify({
      counts,
      badgeErr: badgeErr ? badgeErr.textContent : null,
      badgeWarn: badgeWarn ? badgeWarn.textContent : null,
      sbErr: sbErr ? sbErr.textContent.trim() : null,
      sbWarn: sbWarn ? sbWarn.textContent.trim() : null,
      baris, marker, setelahFilter, kursor, tabId,
    });
  `,
    90000,
  );
  check(
    'V4',
    v4.counts.errors === 1 &&
      v4.counts.warnings === 1 &&
      v4.badgeErr === '1' &&
      v4.badgeWarn === '1' &&
      v4.sbErr === '⊗ 1' &&
      v4.sbWarn === '⚠ 1' &&
      v4.baris.length === 2 &&
      v4.marker >= 2 &&
      v4.setelahFilter === 1 &&
      v4.kursor === 4,
    `2 diagnostik masuk (${v4.counts.errors} error, ${v4.counts.warnings} warning): badge tab ` +
      `${v4.badgeErr}/${v4.badgeWarn}, status bar "${v4.sbErr}" "${v4.sbWarn}", ` +
      `${v4.marker} gutter marker di editor; filter "warning" menyisakan ${v4.setelahFilter} baris; ` +
      `klik baris error memindah kursor ke line ${v4.kursor} (diminta 4)`,
  );

  // ═════════ V5: Output 10.000 baris virtualized ═════════
  const v5 = await cdp.json(
    `
    const P = window.__ZEPHYR_PANEL__;
    P.focusTab('output');
    P.output.setChannel('zephyr');
    P.output.clear('zephyr');
    P.output.setAutoScroll(true);
    await wait(400);

    const t0 = performance.now();
    // Kirim dalam 20 batch supaya mirip log yang mengalir, bukan satu blob.
    for (let b = 0; b < 20; b++) {
      let teks = '';
      for (let i = 0; i < 500; i++) teks += 'baris ' + (b * 500 + i) + ' log uji panel bawah\\n';
      P.output.append('zephyr', teks);
    }
    await wait(700);
    const msAppend = Math.round(performance.now() - t0);

    const totalStore = P.output.lines('zephyr');
    const domBaris = qa('[data-testid="ov-line"]').length;
    const countUi = q('[data-testid="ov-count"]') ? q('[data-testid="ov-count"]').textContent : null;

    // Auto-scroll: setelah append, viewport ada di dasar.
    const list = q('[data-testid="ov-list"]');
    const diBawah = list.scrollHeight - list.scrollTop - list.clientHeight < 40;

    // Scroll lock: matikan auto-scroll, append lagi, posisi TIDAK berubah.
    P.output.setAutoScroll(false);
    await wait(200);
    list.scrollTop = 500;
    await wait(300);
    const posSebelum = list.scrollTop;
    P.output.append('zephyr', 'baris tambahan setelah lock\\n');
    await wait(500);
    const posSesudah = list.scrollTop;

    // Cap buffer melingkar 5000.
    const totalSetelah = P.output.lines('zephyr');

    // Clear.
    P.output.clear('zephyr');
    await wait(400);
    const setelahClear = P.output.lines('zephyr');
    const adaEmpty = !!q('[data-testid="ov-empty"]');
    P.output.setAutoScroll(true);

    return JSON.stringify({
      msAppend, totalStore, domBaris, countUi, diBawah,
      posSebelum, posSesudah, totalSetelah, setelahClear, adaEmpty,
    });
  `,
    90000,
  );
  check(
    'V5',
    v5.totalStore === 5000 &&
      v5.domBaris > 0 &&
      v5.domBaris < 200 &&
      v5.diBawah &&
      v5.posSesudah === v5.posSebelum &&
      v5.setelahClear === 0 &&
      v5.adaEmpty,
    `10.000 baris di-append dalam ${v5.msAppend}ms → buffer melingkar menahan ${v5.totalStore} ` +
      `(cap 5000) tapi DOM hanya ${v5.domBaris} baris (virtualized, bukan 5000 node); ` +
      `auto-scroll menempel di dasar (${v5.diBawah}); scroll-lock ON → append tidak menggeser ` +
      `posisi (${v5.posSebelum}→${v5.posSesudah}); Clear mengosongkan (${v5.setelahClear}, empty-state ${v5.adaEmpty})`,
  );

  // ═════════ V6: Ports ═════════
  const v6 = await cdp.json(
    `
    const P = window.__ZEPHYR_PANEL__;
    P.ports.clear();
    P.focusTab('ports');
    await wait(400);
    const kosongAwal = !!q('[data-testid="ports-empty"]');

    // 1) manual lewat UI (jalur yang dipakai user).
    const inp = q('[data-testid="ports-add-input"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '3000');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(200);
    q('[data-testid="ports-add"]').click();
    await wait(500);

    // 2) dari "SSH" — jalur yang akan dipakai fase 07.
    P.ports.add({ hostPort: 8099, privatePort: 80, protocol: 'http', process: 'nginx',
                  source: 'ssh', forwarder: 'sesi-uji', status: 'running' });
    await wait(500);

    const baris = qa('[data-testid="ports-row"]').map((r) => ({
      id: r.dataset.portRow,
      sel: [...r.querySelectorAll('td')].slice(0, 7).map((td) => td.textContent.trim()),
    }));
    const daftar = P.ports.list();
    const url = daftar.length > 0 ? P.ports.urlFor(daftar[0].id) : null;

    // Stop → status berubah.
    qa('[data-testid="ports-toggle"]')[0].click();
    await wait(400);
    const statusSetelahStop = P.ports.list()[0].status;

    // Hapus satu → hilang dari tabel.
    qa('[data-testid="ports-remove"]')[0].click();
    await wait(400);
    const sisa = P.ports.list().length;
    const barisSisa = qa('[data-testid="ports-row"]').length;

    P.ports.clear();
    await wait(300);
    const kosongAkhir = !!q('[data-testid="ports-empty"]');
    return JSON.stringify({
      kosongAwal, baris, url, statusSetelahStop, sisa, barisSisa, kosongAkhir,
      sumber: daftar.map((p) => p.source),
    });
  `,
    90000,
  );
  check(
    'V6',
    v6.kosongAwal &&
      v6.baris.length === 2 &&
      v6.sumber.includes('manual') &&
      v6.sumber.includes('ssh') &&
      v6.url === 'http://localhost:3000' &&
      v6.statusSetelahStop === 'stopped' &&
      v6.sisa === 1 &&
      v6.barisSisa === 1 &&
      v6.kosongAkhir,
    `empty-state awal (${v6.kosongAwal}); Add Port 3000 lewat UI + 1 entri sumber "ssh" → ` +
      `2 baris tabel (sumber: ${v6.sumber.join(', ')}), URL ${v6.url}; ` +
      `Stop mengubah status ke ${v6.statusSetelahStop}; Hapus menyisakan ${v6.sisa} baris ` +
      `(DOM ${v6.barisSisa}); clear → empty-state lagi (${v6.kosongAkhir})`,
  );
};
