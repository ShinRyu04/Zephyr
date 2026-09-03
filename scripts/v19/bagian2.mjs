// v19/bagian2.mjs — V7..V11 fase 19.

const J = JSON.stringify;

export const bagian2 = async (cdp, check, { EXT_LOKAL, EXT_RUSAK, tsc, cargo, cargoOk }) => {
  /**
   * Pastikan ExtensionsView benar-benar TERENDER sebelum menyentuh DOM-nya.
   *
   * BUG HARNESS yang ini perbaiki: V3 membuka Settings (`setActivity('settings')`)
   * lalu hanya memanggil `setSettingsOpen(false)`. Activity-nya TETAP 'settings',
   * jadi sidebar merender SettingsNav dan semua `[data-ext-card]` = null —
   * V7/V8/V9/V10 gagal padahal produknya benar.
   */
  const bukaPanel = `
    S.getState().setSettingsOpen(false);
    S.getState().setActivity('extensions');
    if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
    if (TS().maximized || TS().visible) TS().setVisible(false);
    E19.setQ('');
    E19.setTab('installed');
    E19.state().setErr(null);
    await wait(600);
  `;

  // ═════════ V7: Disable → kontribusi hilang; Enable → kembali ═════════
  const v7 = await cdp.json(
    `
    ${bukaPanel}
    const id = 'zephyr.keymap-sublime';
    const cmdUji = 'editor.copyLineDown';

    const aktifAwal = E19.terpasang().find((x) => x.id === id)?.enabled;
    const chordAwal = E19.chord(cmdUji);
    const keymapAwal = E19.keymapEkstensi().length;

    // Disable lewat TOMBOL di kartu.
    E19.setQ('');
    E19.setTab('installed');
    await wait(400);
    const tombol = q('[data-testid="xc-toggle-' + id + '"]');
    const labelSebelum = tombol ? tombol.textContent.trim() : null;
    tombol?.click();
    await wait(2200);

    const setelahMati = {
      enabled: E19.terpasang().find((x) => x.id === id)?.enabled,
      chord: E19.chord(cmdUji),
      keymap: E19.keymapEkstensi().length,
      label: q('[data-testid="xc-toggle-' + id + '"]')?.textContent.trim() ?? null,
      dataEnabled: q('[data-ext-card="' + id + '"]')?.getAttribute('data-enabled') ?? null,
      barReload: !!q('[data-testid="ext-reload-bar"]'),
    };

    // Enable lagi.
    q('[data-testid="xc-toggle-' + id + '"]')?.click();
    await wait(2200);
    const setelahHidup = {
      enabled: E19.terpasang().find((x) => x.id === id)?.enabled,
      chord: E19.chord(cmdUji),
      keymap: E19.keymapEkstensi().length,
      label: q('[data-testid="xc-toggle-' + id + '"]')?.textContent.trim() ?? null,
    };

    return JSON.stringify({
      aktifAwal, chordAwal, keymapAwal, labelSebelum, setelahMati, setelahHidup,
      masihTerpasang: E19.terpasang().some((x) => x.id === id),
    });
  `,
    150000,
  );
  check(
    'V7',
    v7.aktifAwal === true &&
      v7.chordAwal === 'Ctrl+Shift+D' &&
      v7.setelahMati.enabled === false &&
      v7.setelahMati.keymap === 0 &&
      v7.setelahMati.chord !== 'Ctrl+Shift+D' &&
      v7.setelahMati.label === 'Enable' &&
      v7.setelahMati.dataEnabled === '0' &&
      v7.setelahMati.barReload === true &&
      v7.setelahHidup.enabled === true &&
      v7.setelahHidup.keymap === v7.keymapAwal &&
      v7.setelahHidup.chord === 'Ctrl+Shift+D' &&
      v7.setelahHidup.label === 'Disable' &&
      v7.masihTerpasang,
    `Klik "${v7.labelSebelum}" → enabled ${v7.aktifAwal}→${v7.setelahMati.enabled}, kontribusi ` +
      `keymap ${v7.keymapAwal}→${v7.setelahMati.keymap}, chord editor.copyLineDown kembali dari ` +
      `"${v7.chordAwal}" ke "${v7.setelahMati.chord}" (default), tombol jadi ` +
      `"${v7.setelahMati.label}", kartu data-enabled=${v7.setelahMati.dataEnabled}, dan bar Reload ` +
      `muncul (${v7.setelahMati.barReload}). Klik Enable → kontribusi kembali ` +
      `(${v7.setelahHidup.keymap} keymap, chord "${v7.setelahHidup.chord}"). FILE TIDAK DIHAPUS: ` +
      `masih terpasang=${v7.masihTerpasang}`,
  );

  // ═════════ V8: Uninstall → folder + entri hilang, kontribusi lenyap ═════════
  const v8 = await cdp.json(
    `
    ${bukaPanel}
    const id = 'zephyr.keymap-sublime';
    const cmdUji = 'editor.copyLineDown';

    const sebelum = {
      terpasang: E19.terpasang().map((x) => x.id),
      path: E19.terpasang().find((x) => x.id === id)?.path ?? null,
      chord: E19.chord(cmdUji),
      keymap: E19.keymapEkstensi().length,
    };

    // Roda-gigi → Uninstall. Popover-nya TOGGLE (jebakan yang sama dengan
    // tombol Marketplace fase 13): klik kedua menutupnya, jadi menu harus
    // ditutup dulu lewat setMenu(null) sebelum dibuka lagi.
    const asli = window.confirm;
    let ditanya = 0;
    let pesan = null;
    window.confirm = (m) => { ditanya++; pesan = m; return false; };

    E19.state().setMenu(null);
    await wait(200);
    q('[data-testid="xc-gear-' + id + '"]')?.click();
    await wait(400);
    const tombolTolak = q('[data-testid="xc-uninstall-' + id + '"]');
    tombolTolak?.click();
    await wait(1200);
    const setelahTolak = {
      ditanya,
      tombolAda: !!tombolTolak,
      terpasang: E19.terpasang().some((x) => x.id === id),
    };

    // Sekarang setujui.
    window.confirm = (m) => { ditanya++; pesan = m; return true; };
    E19.state().setMenu(null);
    await wait(300);
    q('[data-testid="xc-gear-' + id + '"]')?.click();
    await wait(400);
    const tombolSetuju = q('[data-testid="xc-uninstall-' + id + '"]');
    tombolSetuju?.click();
    await wait(2500);
    window.confirm = asli;

    return JSON.stringify({
      sebelum, setelahTolak, ditanya, pesan,
      sesudah: {
        terpasang: E19.terpasang().map((x) => x.id),
        adaLagi: E19.terpasang().some((x) => x.id === id),
        chord: E19.chord(cmdUji),
        keymap: E19.keymapEkstensi().length,
        kartuTerpasang: q('[data-ext-card="' + id + '"]')?.getAttribute('data-terpasang') ?? null,
      },
    });
  `,
    150000,
  );
  check(
    'V8',
    v8.sebelum.terpasang.includes('zephyr.keymap-sublime') &&
      v8.setelahTolak.tombolAda === true &&
      v8.setelahTolak.ditanya === 1 &&
      v8.setelahTolak.terpasang === true &&
      v8.sesudah.adaLagi === false &&
      v8.sesudah.keymap === 0 &&
      v8.sesudah.chord !== 'Ctrl+Shift+D' &&
      String(v8.pesan).includes('Hapus'),
    `Uninstall lewat roda-gigi MEMINTA KONFIRMASI dulu ("${v8.pesan}"): saat ditolak ekstensi ` +
      `TETAP terpasang (${v8.setelahTolak.terpasang}). Setelah disetujui, entri hilang dari daftar ` +
      `(${J(v8.sebelum.terpasang)} → ${J(v8.sesudah.terpasang)}), kontribusi lenyap ` +
      `(keymap ${v8.sebelum.keymap}→${v8.sesudah.keymap}, chord "${v8.sebelum.chord}"→` +
      `"${v8.sesudah.chord}"), dan kartunya kembali data-terpasang=${v8.sesudah.kartuTerpasang}`,
  );

  // ═════════ V9: install dari folder lokal + manifest rusak tidak bikin crash ═════════
  const v9 = await cdp.json(
    `
    ${bukaPanel}
    // Ekstensi lokal sudah dipasang di V6; pastikan ia muncul di INSTALLED
    // walau BUKAN bagian katalog bundled.
    E19.setTab('installed');
    E19.setQ('');
    await E19.refresh();
    await wait(600);

    const lokal = E19.terpasang().find((x) => x.id === 'uji.perkakas') ?? null;
    const kartu = q('[data-ext-card="uji.perkakas"]');

    // Panel Details: kontribusi nyata dari manifest.
    // Roda-gigi = Popover TOGGLE (pelajaran V8) — tutup dulu sebelum dibuka.
    E19.state().setMenu(null);
    E19.setDetail(null);
    await wait(250);
    q('[data-testid="xc-gear-uji.perkakas"]')?.click();
    await wait(400);
    q('[data-testid="xc-details-uji.perkakas"]')?.click();
    // Tunggu panel Details benar-benar terpasang.
    let detail = null;
    for (let i = 0; i < 20; i++) {
      await wait(250);
      detail = q('[data-testid="ext-details"]');
      if (detail && qa('[data-testid="ext-contribs"] [data-contrib]').length > 0) break;
    }
    const kontrib = qa('[data-testid="ext-contribs"] [data-contrib]').map((el) => ({
      nama: el.getAttribute('data-contrib'),
      isi: el.querySelector('.xd-contrib-isi')?.textContent.trim() ?? '',
    }));
    q('[data-testid="ext-details-close"]')?.click();
    await wait(300);

    // Manifest RUSAK: install harus gagal dengan pesan jelas, app tetap hidup.
    const errSebelum = (window.__ZEPHYR_ERRORS__ || []).length;
    const okRusak = await E19.install(${J(EXT_RUSAK)});
    await wait(1000);
    const pesanErr = E19.state().err;
    const errSesudah = (window.__ZEPHYR_ERRORS__ || []).length;

    return JSON.stringify({
      lokal, kartuAda: !!kartu,
      detailAda: !!detail, kontrib,
      okRusak, pesanErr,
      errSebelum, errSesudah,
      masihJalan: typeof S.getState().tabs.length === 'number',
    });
  `,
    150000,
  );
  check(
    'V9',
    v9.lokal !== null &&
      v9.lokal.id === 'uji.perkakas' &&
      v9.lokal.versi === '2.1.0' &&
      v9.lokal.manifestFile === 'zephyr-extension.json' &&
      v9.kartuAda &&
      v9.detailAda &&
      v9.kontrib.length === 6 &&
      v9.kontrib.some((k) => k.nama === 'Commands' && k.isi.includes('Sapa')) &&
      v9.okRusak === false &&
      String(v9.pesanErr).length > 5 &&
      v9.errSesudah === v9.errSebelum &&
      v9.masihJalan,
    `Ekstensi dari FOLDER LOKAL (bukan katalog) tampil di INSTALLED: id="${v9.lokal?.id}" ` +
      `v${v9.lokal?.versi}, manifest "${v9.lokal?.manifestFile}". Panel Details menampilkan ` +
      `${v9.kontrib.length} baris kontribusi nyata dari manifest ` +
      `(${J(v9.kontrib.filter((k) => k.isi !== '—').map((k) => k.nama + ': ' + k.isi.slice(0, 30)))}). ` +
      `Folder dengan manifest RUSAK ditolak (install=${v9.okRusak}) dengan pesan ` +
      `"${String(v9.pesanErr).slice(0, 70)}" dan TIDAK menambah error konsol ` +
      `(${v9.errSebelum}→${v9.errSesudah}) — app tetap jalan`,
  );

  // ═════════ V10: registry remote kosong = "tidak tersedia", bukan error ═════════
  const v10 = await cdp.json(
    `
    ${bukaPanel}
    E19.setRemoteUrl('');
    E19.setTab('marketplace');
    await E19.muatRemote();
    await wait(700);

    const kosong = {
      pesan: q('[data-testid="ext-market-off"]')?.textContent.trim().slice(0, 80) ?? null,
      err: E19.state().err,
      remoteErr: E19.state().remoteErr,
      kartu: qa('[data-ext-card]').length,
    };

    // URL yang PASTI gagal → tetap tidak boleh crash, cuma pesan.
    E19.setRemoteUrl('http://127.0.0.1:1/registry.json');
    await E19.muatRemote();
    await wait(1200);
    const gagal = {
      remoteErr: E19.state().remoteErr,
      pesanDom: q('[data-testid="ext-market-err"]')?.textContent.trim().slice(0, 70) ?? null,
      errorKonsol: (window.__ZEPHYR_ERRORS__ || []).length,
    };

    // Bundled + lokal tetap jalan setelah marketplace mati.
    E19.setRemoteUrl('');
    E19.setTab('installed');
    await wait(600);
    const tetapJalan = {
      kartu: qa('[data-ext-card]').length,
      terpasang: E19.terpasang().length,
    };

    return JSON.stringify({ kosong, gagal, tetapJalan });
  `,
    150000,
  );
  check(
    'V10',
    v10.kosong.pesan !== null &&
      String(v10.kosong.pesan).toLowerCase().includes('tidak tersedia') &&
      v10.kosong.err === null &&
      v10.kosong.remoteErr === null &&
      v10.kosong.kartu === 0 &&
      v10.gagal.remoteErr !== null &&
      v10.tetapJalan.kartu >= 8 &&
      v10.tetapJalan.terpasang >= 1,
    `Registry remote kosong → tab Marketplace menampilkan "${v10.kosong.pesan}" dengan ` +
      `err=${v10.kosong.err} (BUKAN error) dan 0 kartu. URL yang tidak bisa dihubungi → ` +
      `pesan "${String(v10.gagal.remoteErr).slice(0, 40)}" ditampilkan sebagai catatan, bukan crash. ` +
      `Katalog bundled + ekstensi lokal tetap berfungsi sesudahnya (${v10.tetapJalan.kartu} kartu, ` +
      `${v10.tetapJalan.terpasang} terpasang)`,
  );

  // ═════════ V11: tsc/cargo + RAM + tidak ada error konsol ═════════
  const v11 = await cdp.json(
    `
    const d = await window.__ZEPHYR_DIAG__.get();
    return JSON.stringify({
      // ramBytes = memori proses Rust sendiri (patokan yang dipakai fase 21/24);
      // ramTotalBytes ikut menghitung proses WebView2 anak, jadi angkanya jauh
      // lebih besar dan bukan yang dimaksud target PRD 400MB.
      ramMb: Math.round((d.ramBytes || 0) / 1024 / 1024),
      ramTotalMb: Math.round((d.ramTotalBytes || 0) / 1024 / 1024),
      errorKonsol: (window.__ZEPHYR_ERRORS__ || []).slice(0, 3),
      jmlError: (window.__ZEPHYR_ERRORS__ || []).length,
      ringkasan: E19.ringkasan(),
      gagalLoader: E19.ringkasan().gagal,
    });
  `,
    90000,
  );
  const tscOk = tsc.status === 0;
  check(
    'V11',
    tscOk &&
      cargoOk &&
      v11.jmlError === 0 &&
      v11.ramMb > 0 &&
      v11.ramMb < 400 &&
      v11.gagalLoader.length === 0,
    `tsc --noEmit exit ${tsc.status}; cargo test --lib exit ${cargo.status} (lulus=${cargoOk}); ` +
      `RAM proses Zephyr ${v11.ramMb} MB (target PRD < 400; total termasuk WebView2 ` +
      `${v11.ramTotalMb} MB — paket bahasa lazy-import, hanya dimuat saat file bahasanya dibuka); ` +
      `${v11.jmlError} error konsol sepanjang V1–V10; ` +
      `loader tidak melaporkan kegagalan (${J(v11.gagalLoader)})` +
      (tscOk ? '' : '\\n' + (tsc.stdout || '').split('\\n').slice(0, 5).join('\\n')),
  );
};
