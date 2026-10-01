// v26/bagian2.mjs — V4 & V5 fase 26.

const J = JSON.stringify;

export const bagian2 = async (cdp, check, { FILE_UJI, FILE_BESAR, FILE_BINER }) => {
  const F = J(FILE_UJI);

  // ═════════ V4: retention (maxPerFile) + dedup isi identik ═════════
  const v4 = await cdp.json(
    `
    await HS.clear(${F}).catch(() => {});
    const tabId = S.getState().activeTabId;

    // Buat 5 snapshot dengan isi BERBEDA lewat jalur Rust langsung supaya
    // batas retention yang diuji adalah milik produk, bukan efek samping UI.
    //
    // PENTING: saveTab() SENDIRI sudah memicu snapshot (event
    // zephyr-history-snapshot). Jadi setelah save, snapshotRaw() berikutnya
    // akan kena dedup — isinya sama. Karena itu setiap ronde memakai SATU
    // jalur saja: save (yang otomatis snapshot), bukan save + snapshotRaw.
    const dibuat = [];
    for (let i = 1; i <= 5; i++) {
      S.getState().updateTabContent(tabId, 'retensi ' + i + '\\n');
      const ok = await S.getState().saveTab(tabId);
      dibuat.push(ok);
      await wait(700);
    }
    const sebelumPangkas = (await HS.list(${F})).snapshots.length;

    // ── dedup ──
    //
    // Snapshot PERTAMA di sini masih membuat entri baru, dan itu BENAR:
    // store.ts memicu snapshot SEBELUM fsWrite, jadi snapshot terakhir dari
    // loop di atas memuat isi SEBELUM save ke-5 ("retensi 4"), sementara disk
    // sudah "retensi 5". Yang harus ditolak adalah percobaan KEDUA dan
    // seterusnya — saat disk benar-benar identik dengan snapshot terakhir.
    const d1 = await HS.snapshotRaw(${F}, 'manual', 50, 30);
    const d2 = await HS.snapshotRaw(${F}, 'manual', 50, 30);
    const d3 = await HS.snapshotRaw(${F}, 'manual', 50, 30);
    const setelahDedup = (await HS.list(${F})).snapshots.length;

    // ── retention: maxPerFile = 2 ──
    const dibuang = await HS.prune(${F}, 2, 30);
    const setelahPangkas = await HS.list(${F});

    // Yang tersisa harus yang TERBARU (id berisi timestamp terbesar).
    const idSisa = setelahPangkas.snapshots.map((s) => s.id);
    const tsSisa = setelahPangkas.snapshots.map((s) => s.timestampMs);

    // Setting retention lewat Settings juga harus tersimpan ke disk.
    await S.getState().applySettings({ history: { maxPerFile: 7, maxDays: 3 } });
    await wait(700);
    const dariDisk = await window.__ZEPHYR_SET__.settingsFromDisk();

    return JSON.stringify({
      dibuat,
      sebelumPangkas,
      d1id: d1.id !== '' ? 'baru' : '',
      d1skip: d1.skip,
      d2id: d2.id,
      d2skip: d2.skip,
      d3id: d3.id,
      d3skip: d3.skip,
      setelahDedup,
      dibuang,
      sisa: idSisa.length,
      tsTurun: tsSisa.every((t, i) => i === 0 || tsSisa[i - 1] >= t),
      settingDisk: dariDisk && dariDisk.history ? dariDisk.history : null,
    });
  `,
    240000,
  );

  check(
    'V4',
    v4.sebelumPangkas === 5 &&
      v4.dibuat.every((x) => x === true) &&
      v4.d2id === '' &&
      v4.d2skip.includes('identik') &&
      v4.d3id === '' &&
      v4.d3skip.includes('identik') &&
      v4.setelahDedup === 6 &&
      v4.dibuang === 4 &&
      v4.sisa === 2 &&
      v4.tsTurun === true &&
      v4.settingDisk &&
      v4.settingDisk.maxPerFile === 7 &&
      v4.settingDisk.maxDays === 3,
    `5x save → ${v4.sebelumPangkas} snapshot (saveTab ${J(v4.dibuat)}). Dedup: snapshot ` +
      `manual pertama masih baru (isi disk ≠ snapshot terakhir, karena snapshot ` +
      `diambil SEBELUM tulis), lalu percobaan ke-2 & ke-3 DITOLAK ` +
      `("${v4.d2skip}" / "${v4.d3skip}") — total berhenti di ${v4.setelahDedup}. ` +
      `Retention maxPerFile=2 → ${v4.dibuang} dibuang, sisa ${v4.sisa} yang TERBARU ` +
      `(urut turun=${v4.tsTurun}). settings.json: ${J(v4.settingDisk)}`,
  );

  // ═════════ V5: file besar & biner tidak di-snapshot ═════════
  const v5 = await cdp.json(
    `
    const besar = await HS.snapshotRaw(${J(FILE_BESAR)}, 'manual', 50, 30);
    const biner = await HS.snapshotRaw(${J(FILE_BINER)}, 'manual', 50, 30);
    const listBesar = await HS.list(${J(FILE_BESAR)});
    const listBiner = await HS.list(${J(FILE_BINER)});

    // Panel Timeline harus MENJELASKAN alasannya, bukan diam.
    //
    // TimelineView selalu tentang TAB AKTIF (return null kalau tidak ada tab),
    // jadi HS.muat() saja tidak cukup — filenya harus dibuka sebagai tab.
    // Itu memang perilaku produk yang benar; harness yang harus menyesuaikan.
    await S.getState().openPath(${J(FILE_BESAR)});
    await wait(1500);
    await HS.muat(${J(FILE_BESAR)});
    await wait(900);
    const tg = q('[data-testid="timeline-toggle"]');
    if (tg && tg.getAttribute('aria-expanded') !== 'true') {
      tg.click();
      await wait(700);
    }
    const teksSkip = (q('[data-testid="timeline-skip"]') || {}).textContent || '';
    const skipStore = HS.skip();
    const kosongEl = !!q('[data-testid="timeline-empty"]');

    // File di LUAR workspace harus ditolak (batas keamanan).
    let luar = null;
    try {
      await HS.snapshotRaw('C:/Windows/win.ini', 'manual', 50, 30);
      luar = 'DIIZINKAN (salah)';
    } catch (e) {
      luar = e && e.message ? e.message : String(e);
    }

    // id snapshot yang mengandung .. harus ditolak (path traversal).
    let jahat = null;
    try {
      await HS.read(${F}, '../../secrets.json');
      jahat = 'DIIZINKAN (salah)';
    } catch (e) {
      jahat = e && e.message ? e.message : String(e);
    }

    const commands = HS.commandsDiPalette();
    // Command timeline.restore / timeline.clear punya enabled() yang menyaring
    // saat file aktif tidak punya snapshot — dan saat blok ini jalan, tab aktif
    // adalah file BESAR yang memang tidak boleh punya snapshot. Jadi 2 command
    // itu SEHARUSNYA tidak muncul di sini; yang perlu dibuktikan adalah
    // keduanya muncul kembali setelah kembali ke file yang punya riwayat.
    // (Tanpa backtick di komentar: blok ini ada DI DALAM template literal.)
    await S.getState().openPath(${F});
    await wait(1200);
    await HS.muat(${F});
    await wait(900);
    const commandsAdaRiwayat = HS.commandsDiPalette();
    return JSON.stringify({
      besarId: besar.id,
      besarSkip: besar.skip,
      binerId: biner.id,
      binerSkip: biner.skip,
      snapBesar: listBesar.snapshots.length,
      snapBiner: listBiner.snapshots.length,
      skipDiList: listBesar.skip,
      teksSkip: teksSkip.trim().slice(0, 90),
      skipStore,
      kosongEl,
      luar,
      jahat,
      commands,
      commandsAdaRiwayat,
    });
  `,
    180000,
  );

  check(
    'V5',
    v5.besarId === '' &&
      v5.besarSkip.includes('melewati batas') &&
      v5.binerId === '' &&
      v5.binerSkip.includes('biner') &&
      v5.snapBesar === 0 &&
      v5.snapBiner === 0 &&
      v5.teksSkip.includes('Tidak disnapshot') &&
      typeof v5.luar === 'string' &&
      v5.luar !== 'DIIZINKAN (salah)' &&
      v5.jahat !== 'DIIZINKAN (salah)' &&
      v5.commands.length === 2 &&
      v5.commandsAdaRiwayat.length === 4,
    `File 5MB+ ditolak ("${v5.besarSkip}"), file biner ditolak ("${v5.binerSkip}") — ` +
      `0 snapshot untuk keduanya. Panel menjelaskan alasannya: "${v5.teksSkip}". ` +
      `Keamanan: file di luar workspace ditolak (${J(v5.luar)}), id snapshot ` +
      `"../../secrets.json" ditolak (${J(v5.jahat)}). Palette: saat tab = file besar ` +
      `hanya ${v5.commands.length} command aktif ${J(v5.commands)} (restore/clear ` +
      `disaring enabled()), setelah pindah ke file berriwayat jadi ` +
      `${v5.commandsAdaRiwayat.length}: ${J(v5.commandsAdaRiwayat)}`,
  );
};
