// v26/bagian1.mjs — V2 & V3 fase 26.

const J = JSON.stringify;

export const bagian1 = async (cdp, check, { FILE_UJI }) => {
  const F = J(FILE_UJI);

  // ═════════ V2: 3x save → 3 snapshot + Timeline (snapshot + commit git) ═════
  const v2 = await cdp.json(
    `
    // Mulai bersih supaya hitungannya pasti.
    await HS.clear(${F}).catch(() => {});

    await S.getState().openPath(${F});
    await wait(900);
    const tabId = S.getState().activeTabId;
    const tab0 = S.getState().tabs.find((t) => t.id === tabId);
    if (!tab0) return JSON.stringify({ gagal: 'tab tidak terbuka' });

    // Tiga kali edit + save lewat jalur PRODUK (updateTabContent + saveTab).
    // Snapshot diambil store.ts SEBELUM fsWrite, jadi isi snapshot ke-N adalah
    // versi SEBELUM save ke-N — itu yang berguna untuk kembali.
    const isi = ['versi satu\\nbaris dua\\n', 'versi dua\\nbaris dua\\n', 'versi tiga\\nbaris dua\\n'];
    const hasilSave = [];
    for (const t of isi) {
      S.getState().updateTabContent(tabId, t);
      const ok = await S.getState().saveTab(tabId);
      hasilSave.push(ok);
      // Beri jeda: event zephyr-history-snapshot diproses App.tsx secara async,
      // dan nama file snapshot memakai timestamp ms — dua save dalam ms yang
      // sama akan bertabrakan nama.
      await wait(700);
    }

    // Timeline lewat store (bukan langsung Rust) supaya integrasi terbukti.
    await HS.muat(${F});
    await wait(900);
    const tl = HS.timeline();
    const daftar = await HS.list(${F});

    // Timeline HARUS terbuka sebelum barisnya diperiksa: header-nya toggle,
    // dan V2 sebelumnya membaca 0 item padahal store punya 28 entri.
    const tg = q('[data-testid="timeline-toggle"]');
    if (tg && tg.getAttribute('aria-expanded') !== 'true') {
      tg.click();
      await wait(600);
    }
    const root = q('[data-testid="timeline"]');
    const jmlItem = qa('[data-testid="timeline-item"]').length;
    const teksJml = (q('[data-testid="timeline-count"]') || {}).textContent || '';

    return JSON.stringify({
      hasilSave,
      snapshotRust: daftar.snapshots.length,
      reasonRust: daftar.snapshots.map((s) => s.reason),
      dir: daftar.dir !== '',
      timelineTotal: tl.length,
      snapshotDiTimeline: tl.filter((t) => t.kind === 'snapshot').length,
      commitDiTimeline: tl.filter((t) => t.kind === 'commit').length,
      urutTurun: tl.every((t, i) => i === 0 || tl[i - 1].ts >= t.ts),
      adaRoot: !!root,
      jmlItem,
      teksJml: teksJml.trim(),
      isiFileSekarang: S.getState().tabs.find((t) => t.id === tabId).content,
    });
  `,
    180000,
  );

  check(
    'V2',
    v2.hasilSave &&
      v2.hasilSave.length === 3 &&
      v2.hasilSave.every((x) => x === true) &&
      v2.snapshotRust === 3 &&
      v2.dir === true &&
      v2.snapshotDiTimeline === 3 &&
      v2.commitDiTimeline > 0 &&
      v2.urutTurun === true &&
      v2.adaRoot === true &&
      v2.jmlItem === v2.timelineTotal,
    `3x edit+save lewat jalur produk (saveTab ${J(v2.hasilSave)}) → ` +
      `${v2.snapshotRust} snapshot di disk, reason ${J(v2.reasonRust)}, folder history ada=` +
      `${v2.dir}. Timeline gabungan: ${v2.timelineTotal} entri = ` +
      `${v2.snapshotDiTimeline} snapshot + ${v2.commitDiTimeline} commit git, ` +
      `urut terbaru→lama=${v2.urutTurun}. DOM merender ${v2.jmlItem} baris ` +
      `(badge hitung "${v2.teksJml}")`,
  );

  // ═════════ V3: diff snapshot vs current + Restore = dirty, disk utuh ═══════
  const v3 = await cdp.json(
    `
    const tabId = S.getState().activeTabId;
    const tl = HS.timeline().filter((t) => t.kind === 'snapshot');
    const snapTerbaru = tl[0];
    const snapTertua = tl[tl.length - 1];

    // Klik entri Timeline → DiffViewer terpasang (jalur UI sungguhan).
    // Panel wajib terbuka dulu — kalau tidak, .tl-main tidak ada di DOM.
    // (Jangan pakai backtick di komentar ini: ia berada DI DALAM template
    // literal, jadi backtick menutupnya lebih awal dan sisa kode jadi
    // ekspresi aneh — pernah bikin error "main is not defined".)
    const tg = q('[data-testid="timeline-toggle"]');
    if (tg && tg.getAttribute('aria-expanded') !== 'true') {
      tg.click();
      await wait(600);
    }
    const el = q('[data-tl-id="' + snapTertua.id + '"] .tl-main');
    if (el) el.click();
    await wait(1400);
    const d = HS.diff();
    const baris = d ? d.teks.split('\\n') : [];
    const plus = baris.filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    const minus = baris.filter((l) => l.startsWith('-') && !l.startsWith('---'));

    // Isi snapshot tertua = "versi awal" (versi SEBELUM save pertama).
    const isiTertua = await HS.read(${F}, snapTertua.id);

    // ── Restore ──
    const sebelumRestore = S.getState().tabs.find((t) => t.id === tabId);
    const okRestore = await HS.restore(snapTertua.id);
    await wait(900);
    const sesudah = S.getState().tabs.find((t) => t.id === tabId);

    HS.tutupDiff();
    return JSON.stringify({
      idTertua: snapTertua.id,
      idTerbaru: snapTerbaru.id,
      diffAda: !!d,
      diffPath: d ? d.path : null,
      diffPunyaHeader: baris.slice(0, 3).join(' | '),
      plus: plus.length,
      minus: minus.length,
      // kiri=riwayat → baris riwayat muncul sebagai '-', kini sebagai '+'
      minusMemuatAwal: minus.some((l) => l.includes('versi awal')),
      plusMemuatTiga: plus.some((l) => l.includes('versi tiga')),
      isiTertua,
      okRestore,
      isiSebelum: sebelumRestore.content,
      isiSesudah: sesudah.content,
      unsavedSebelum: sebelumRestore.unsaved,
      unsavedSesudah: sesudah.unsaved,
    });
  `,
    180000,
  );

  check(
    'V3',
    v3.diffAda === true &&
      v3.minusMemuatAwal === true &&
      v3.plusMemuatTiga === true &&
      v3.isiTertua.includes('versi awal') &&
      v3.okRestore === true &&
      v3.unsavedSebelum === false &&
      v3.unsavedSesudah === true &&
      v3.isiSesudah.includes('versi awal') &&
      v3.isiSebelum.includes('versi tiga'),
    `Klik entri Timeline → DiffViewer terisi (${J(v3.diffPath)}): ` +
      `${v3.minus} baris '-' (riwayat, memuat "versi awal"=${v3.minusMemuatAwal}) vs ` +
      `${v3.plus} baris '+' (kini, memuat "versi tiga"=${v3.plusMemuatTiga}) — ` +
      `kiri=riwayat kanan=kini. Restore snapshot tertua: buffer editor berubah ` +
      `dari "versi tiga…" ke "versi awal…" dan tab jadi DIRTY ` +
      `(unsaved ${v3.unsavedSebelum}→${v3.unsavedSesudah}) tanpa menulis disk`,
  );
};
