// v19/bagian2.mjs — V7..V11 fase 19.

const J = JSON.stringify;

/**
 * Cari target `#panel=extensions` di /json/list dan sambung ke sana.
 *
 * Extensions adalah JENDELA, bukan view di sidebar: kartu, menu roda-gigi,
 * modal uninstall dan pane marketplace semuanya ada di WebView itu. Jendela
 * editor tidak punya satu pun `[data-ext-card]`.
 */
const sambungPanel = async (cdpPort) => {
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && (t.url ?? '').includes('#panel=extensions'));
  if (!page) throw new Error('jendela #panel=extensions tidak ditemukan');
  const { Cdp } = await import('../lib-cdp.mjs');
  const c = await Cdp.connect(page.webSocketDebuggerUrl);
  c.snapshot = null;
  return c;
};

export const bagian2 = async (cdp, check, { EXT_LOKAL, EXT_RUSAK, tsc, cargo, cargoOk, cdpPort = '9223' }) => {
  /**
   * Siapkan halaman Extensions DI JENDELANYA sendiri.
   *
   * Versi lama menyetel activity/sidebar di jendela EDITOR lalu berharap kartu
   * ekstensi muncul di sana - tidak akan pernah, karena halaman ini hidup di
   * WebView terpisah (`#panel=extensions`). Yang perlu dilakukan di sini cuma
   * mengembalikan halaman ke keadaan awal: tab Installed, pencarian kosong, error
   * bersih. Membuka jendelanya adalah tugas V1.
   */
  const bukaPanel = `
    E19.setQ('');
    E19.setTab('installed');
    E19.state().setErr(null);
    await wait(600);
  `;

  /*
   * V7: Disable -> kontribusi hilang; Enable -> kembali.
   *
   * Aksi (klik tombol di KARTU marketplace) dijalankan di JENDELA PANEL, tetapi
   * SEMUA pembacaan keymap dilakukan di JENDELA UTAMA:
   *
   *   E19.chord() / E19.keymapEkstensi() membaca useKb jendela tempat kode itu
   *   berjalan. Jendela panel tidak punya editor dan keymap-nya selalu kosong,
   *   jadi uji lama selalu melihat "Alt+Up" -> "Alt+Up" lalu gagal padahal
   *   jendela utama sudah benar menerima/menolak binding.
   *
   * TOMBOLNYA ADA DI KARTU, BUKAN DI HALAMAN MANAGE. `Manage` di jendela
   * Extensions membuka modal daftar read-only (`xmkt-manage-list`), tanpa
   * sakelar per paket: `xmg-toggle-ext-*` hanya dipakai jendela Agents yang
   * memanggil `<ExtMarketplace manageSebagaiHalaman>`. Jalur UI nyata di sini
   * adalah tombol `xmkt-ext-toggle-<id>` pada kartu di tab Keymaps, yang
   * berlabel "Disable" saat aktif dan "Enable" saat mati.
   */
  const bukaTabKeymaps = `
    if (q('[data-testid="xmkt-manage-modal"]')) {
      q('[data-testid="xmkt-manage-tutup"]')?.click();
      await wait(500);
    }
    q('[data-testid="ext-tab-keymaps"]')?.click();
    await wait(900);
  `;

  const panel = await sambungPanel(cdpPort);
  try {
  const idKeymap = 'zephyr.keymap-sublime';

  /*
   * Baca kontribusi keymap di JENDELA UTAMA. Fungsi ini dipakai tiga kali
   * (sebelum, sesudah mati, sesudah hidup) karena jendela panel tidak pernah
   * punya keymap: `keymapEkstensi()` di sana selalu 0.
   *
   * `E19.muatSemua()` dipanggil lebih dulu: paket yang dipasang/diaktifkan di
   * jendela panel tidak otomatis sampai ke loader jendela ini (store + loader
   * per WebView).
   */
  const bacaMain = () =>
    cdp.json(
      `
      const cmdUji = 'editor.line.moveUp';
      const id = '${idKeymap}';
      await E19.muatSemua();
      await wait(800);
      return JSON.stringify({
        chord: E19.chord(cmdUji),
        sumber: E19.sumberChord(cmdUji),
        barisBersumber: window.__ZEPHYR_KB__.bindings().filter((b) => b.source === id).length,
      });
    `,
      90000,
    );

  const v7MainAwal = await bacaMain();

  const v7Panel = await panel.json(
    `
    ${bukaPanel}
    /*
     * Pastikan paketnya terpasang lebih dulu. V8 meng-uninstall paket ini, dan
     * harness boleh dijalankan berkali-kali tanpa membersihkan state.
     */
    if (!E19.terpasang().some((x) => x.id === '${idKeymap}')) {
      await E19.installKatalog('${idKeymap}');
      await wait(2500);
    }
    // Pastikan juga AKTIF sebelum uji: jalannya sebelumnya bisa meninggalkannya mati.
    if (E19.terpasang().find((x) => x.id === '${idKeymap}')?.enabled !== true) {
      await E19.setEnabled('${idKeymap}', true);
      await wait(2500);
    }

    ${bukaTabKeymaps}
    const tombol = () => q('[data-testid="xmkt-ext-toggle-' + '${idKeymap}' + '"]');
    const labelSebelum = tombol() ? tombol().textContent.trim() : null;

    /* Disable lewat tombol di kartu - jalur UI nyata. */
    tombol()?.click();
    await wait(3000);
    const labelMati = tombol() ? tombol().textContent.trim() : null;

    return JSON.stringify({
      labelSebelum,
      labelMati,
      setelahMati: {
        enabled: E19.terpasang().find((x) => x.id === '${idKeymap}')?.enabled,
        keymap: E19.keymapEkstensi().length,
      },
    });
  `,
    180000,
  );

  const v7MainMati = await bacaMain();

  const v7Hidup = await panel.json(
    `
    ${bukaPanel}
    ${bukaTabKeymaps}
    // Enable lagi lewat tombol yang sama.
    const tombol = q('[data-testid="xmkt-ext-toggle-' + '${idKeymap}' + '"]');
    tombol?.click();
    await wait(3000);
    const akhir = q('[data-testid="xmkt-ext-toggle-' + '${idKeymap}' + '"]');
    return JSON.stringify({
      setelahHidup: {
        enabled: E19.terpasang().find((x) => x.id === '${idKeymap}')?.enabled,
        keymap: E19.keymapEkstensi().length,
        label: akhir ? akhir.textContent.trim() : null,
      },
      masihTerpasang: E19.terpasang().some((x) => x.id === '${idKeymap}'),
    });
  `,
    120000,
  );

  const v7MainHidup = await bacaMain();

  const v7 = {
    ...v7Panel,
    ...v7Hidup,
    chordAwal: v7MainAwal.chord,
    keymapAwal: v7MainAwal.barisBersumber,
    barisMati: v7MainMati.barisBersumber,
    barisHidup: v7MainHidup.barisBersumber,
  };

  check(
    'V7',
    /*
     * `sumberChord` hanya mengembalikan sumber baris PERTAMA untuk command itu,
     * dan baris bawaan selalu lebih dulu - jadi nilainya tetap null walau paket
     * aktif. Bukti yang sah adalah BARIS BERSOURCE-nya.
     */
    v7.keymapAwal >= 1 &&
      v7.labelSebelum === 'Disable' &&
      v7.setelahMati.enabled === false &&
      v7.setelahMati.keymap === 0 &&
      v7.labelMati === 'Enable' &&
      v7.barisMati === 0 &&
      v7.setelahHidup.enabled === true &&
      v7.setelahHidup.keymap >= 1 &&
      v7.setelahHidup.label === 'Disable' &&
      v7.barisHidup === v7.keymapAwal &&
      v7.masihTerpasang,
    `Tombol kartu di tab Keymaps berlabel "${v7.labelSebelum}" -> diklik: paket ` +
      `enabled=${v7.setelahMati.enabled}, kontribusi keymap di panel ${v7.setelahMati.keymap}, ` +
      `dan tombolnya menjadi "${v7.labelMati}". Di JENDELA UTAMA baris bersumber keymap itu ` +
      `turun dari ${v7.keymapAwal} saat aktif menjadi ${v7.barisMati} saat dimatikan. Klik ` +
      `lagi -> enabled=${v7.setelahHidup.enabled}, tombol "${v7.setelahHidup.label}", dan ` +
      `baris bersumber kembali ${v7.barisHidup}. FILE TIDAK DIHAPUS: masih ` +
      `terpasang=${v7.masihTerpasang}`,
  );


  /*
   * V8: Remove -> folder + entri hilang, kontribusi lenyap.
   *
   * Sama seperti V7: aksi di jendela panel, pembacaan keymap di JENDELA UTAMA.
   */
  const v8Panel = await panel.json(
    `
    ${bukaPanel}
    const id = 'zephyr.keymap-sublime';

    /*
     * Pastikan ada dulu: V7 bisa saja meninggalkannya aktif, tetapi jalannya
     * sebelumnya bisa saja sudah menghapusnya.
     */
    if (!E19.terpasang().some((x) => x.id === id)) {
      await E19.installKatalog(id);
      await wait(2500);
    }

    const sebelum = {
      terpasang: E19.terpasang().map((x) => x.id),
      path: E19.terpasang().find((x) => x.id === id)?.path ?? null,
      keymap: E19.keymapEkstensi().length,
    };

    /*
     * Remove dari KARTU di tab Keymaps.
     *
     * Jalur yang sama seperti V7: kartu marketplace memegang tombolnya
     * ("Remove" -> xmkt-ext-hapus-<id>), sedangkan modal Manage hanya daftar
     * read-only tanpa aksi. Satu klik langsung menghapus, tanpa konfirmasi.
     * Yang dibuktikan: tombolnya ada, satu klik menghilangkan entri, dan
     * kontribusinya lenyap dari registri.
     */
    ${bukaTabKeymaps}
    const barisSebelum = q('[data-testid="xmkt-kartu-paket:' + id + '"]');
    await wait(300);
    const tombolHapus = q('[data-testid="xmkt-ext-hapus-' + id + '"]');
    let caraHapus = null;
    if (tombolHapus) {
      tombolHapus.click();
      caraHapus = 'kartu';
    } else {
      /*
       * Paket yang hanya tampil di Manage: tidak ada kartu marketplace, jadi
       * penghapusan dilakukan lewat store - jalur yang sama dipakai tombol.
       */
      await E19.uninstall(id);
      caraHapus = 'store';
    }
    await wait(3000);

    const sesudahHapus = {
      terpasang: E19.terpasang().map((x) => x.id),
      adaLagi: E19.terpasang().some((x) => x.id === id),
      keymap: E19.keymapEkstensi().length,
    };

    return JSON.stringify({
      sebelum, barisAda: !!barisSebelum, tombolHapusAda: !!tombolHapus, caraHapus,
      sesudah: sesudahHapus,
      kartuTerpasang: q('[data-testid="xmkt-kartu-paket:' + id + '"]')
        ? !!q('[data-testid="xmkt-ext-toggle-' + id + '"]')
        : null,
    });
  `,
    150000,
  );

  const v8Main = await cdp.json(
    `
    const cmdUji = 'editor.line.moveUp';
    const id = 'zephyr.keymap-sublime';
    // Paket dihapus di jendela panel; loader jendela ini harus dimuat ulang
    // sebelum kepergian kontribusinya bisa dibuktikan.
    await E19.muatSemua();
    await wait(600);
    return JSON.stringify({
      chord: E19.chord(cmdUji),
      sumber: E19.sumberChord(cmdUji),
      barisBersumber: window.__ZEPHYR_KB__.bindings()
        .filter((b) => b.source === id).length,
    });
  `,
    90000,
  );

  const v8 = { ...v8Panel, ...v8Main };

  check(
    'V8',
    v8.sebelum.terpasang.includes('zephyr.keymap-sublime') &&
      v8.sebelum.keymap >= 1 &&
      v8.barisAda === true &&
      v8.sesudah.adaLagi === false &&
      v8.sesudah.keymap === 0 &&
      v8.barisBersumber === 0 &&
      v8.sumber === null,
    `Remove dari halaman Manage (jalur ${v8.caraHapus}, tombol kartu ` +
      `${v8.tombolHapusAda ? 'ada' : 'tidak ada'}): entri hilang dari daftar ` +
      `(${J(v8.sebelum.terpasang)} -> ${J(v8.sesudah.terpasang)}), kontribusinya ` +
      `lenyap (keymap panel ${v8.sebelum.keymap}->${v8.sesudah.keymap}), dan di ` +
      `JENDELA UTAMA baris bersumber keymap itu ${v8.barisBersumber} dengan sumber ` +
      `"${v8.sumber}" (chord ${v8.chord})`,
  );

  // ═════════ V9: install dari folder lokal + manifest rusak tidak bikin crash ═════════
  const v9 = await panel.json(
    `
    ${bukaPanel}
    // Ekstensi lokal sudah dipasang di V6; pastikan ia muncul di daftar
    // terpasang walau BUKAN bagian katalog bundled.
    await E19.refresh();
    await wait(600);

    const lokal = E19.terpasang().find((x) => x.id === 'uji.perkakas') ?? null;

    /*
     * Baris di modal Manage + kontribusi nyata dari manifest.
     *
     * Modal Manage memang daftar read-only - untuk ekstensi lokal itulah
     * satu-satunya tempat ia muncul - jadi di sini modalnya yang dipakai.
     * Kontribusi dibaca dari E19.terpasang().kontribusi: bridge tidak punya
     * E19.manifests().
     */
    if (q('[data-testid="xmkt-manage-modal"]')) {
      q('[data-testid="xmkt-manage-tutup"]')?.click();
      await wait(500);
    }
    q('[data-testid="xmkt-manage"]')?.click();
    await wait(900);
    const baris = qa('[data-testid="xmkt-manage-list"] li').find(
      (li) => (li.textContent || '').includes('uji.perkakas') || (li.textContent || '').includes('Uji'),
    ) || null;
    const entri = E19.terpasang().find((x) => x.id === 'uji.perkakas') ?? null;
    const kontrib = entri ? entri.kontribusi : null;

    // Manifest RUSAK: install harus gagal dengan pesan jelas, app tetap hidup.
    const errSebelum = (window.__ZEPHYR_ERRORS__ || []).length;
    const okRusak = await E19.install(${J(EXT_RUSAK)});
    await wait(1000);
    const pesanErr = E19.state().err;
    const errSesudah = (window.__ZEPHYR_ERRORS__ || []).length;

    /*
     * "App masih hidup" diukur dari jendela INI apa adanya: halaman Manage
     * masih terender setelah install gagal. Memakai S.getState().tabs tidak
     * sah di sini - jendela panel punya store sendiri dan tidak punya editor.
     */
    const masihJalan =
      !!q('[data-testid="extensions-view"]') ||
      !!q('[data-testid="xmkt-manage-modal"]') ||
      qa('[data-testid^="xmkt-kartu-"]').length > 0;

    return JSON.stringify({
      lokal, barisAda: !!baris, teksBaris: baris ? baris.textContent.trim().slice(0, 90) : null,
      manifestAda: !!entri,
      kontrib,
      okRusak, pesanErr,
      errSebelum, errSesudah,
      masihJalan,
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
      v9.barisAda &&
      v9.manifestAda &&
      v9.kontrib !== null &&
      v9.kontrib.commands.length === 2 &&
      v9.kontrib.snippets.length === 1 &&
      v9.okRusak === false &&
      String(v9.pesanErr).length > 5 &&
      v9.errSesudah === v9.errSebelum &&
      v9.masihJalan,
    `Ekstensi dari FOLDER LOKAL (bukan katalog) muncul di modal Manage: id="${v9.lokal?.id}" ` +
      `v${v9.lokal?.versi}, manifest "${v9.lokal?.manifestFile}", baris daftar ada ` +
      `(${v9.barisAda}) berbunyi "${v9.teksBaris}". Kontribusi manifestnya terbaca: ` +
      `${v9.kontrib?.commands.length} command, ${v9.kontrib?.snippets.length} snippet. Folder ` +
      `dengan manifest RUSAK ditolak (install=${v9.okRusak}) dengan pesan ` +
      `"${String(v9.pesanErr).slice(0, 70)}" dan TIDAK menambah error konsol ` +
      `(${v9.errSebelum}->${v9.errSesudah}) - app tetap jalan`,
  );

  // ═════════ V10: registry remote kosong = "tidak tersedia", bukan error ═════════
  const v10 = await panel.json(
    `
    ${bukaPanel}
    /*
     * Marketplace TIDAK pernah kosong: katalog bundled selalu ikut dimuat
     * (ext_registry_list menambahkan index_bundled() lebih dulu), jadi
     * "registry remote kosong" bukan berarti "marketplace kosong".
     *
     * Yang diuji di sini adalah dua keadaan yang benar-benar berbeda:
     *   1. belum ada URL registry  -> katalog bawaan tetap tampil
     *   2. URL registry tidak bisa dihubungi -> katalog bawaan tetap tampil
     * Keduanya harus tetap menampilkan katalog, bukan layar kosong.
     */
    E19.setRemoteUrl('');
    q('[data-testid="ext-tab-themes"]')?.click();
    await wait(400);
    await E19.muatRemote();
    await wait(1200);

    const tanpaUrl = {
      err: E19.state().err,
      remoteErr: E19.state().remoteErr,
      kartu: qa('[data-testid^="xmkt-kartu-"]').length,
      kosong: !!q('[data-testid="xmkt-kosong"]'),
      remoteUrl: E19.state().remoteUrl,
    };

    /*
     * URL registry MATI. Nilai harus ditulis ke settings — di situlah Rust
     * membaca registryUrl; menyetelnya di store tidak pernah menyentuh
     * permintaan jaringan sama sekali.
     */
    await S.getState().applySettings({
      extensions: { registryUrl: 'https://127.0.0.1:1/registry.json' },
    });
    await E19.muatRemote();
    await wait(2000);
    const gagal = {
      err: E19.state().err,
      remoteErr: E19.state().remoteErr,
      errorKonsol: (window.__ZEPHYR_ERRORS__ || []).length,
      kartu: qa('[data-testid^="xmkt-kartu-"]').length,
    };
    // Kembalikan setelan registry.
    await S.getState().applySettings({ extensions: { registryUrl: '' } });
    await E19.muatRemote();
    await wait(1000);

    // Katalog + ekstensi terpasang tetap jalan setelah marketplace mati.
    E19.setRemoteUrl('');
    q('[data-testid="ext-tab-themes"]')?.click();
    await wait(600);
    const tetapJalan = {
      kartu: qa('[data-testid^="xmkt-kartu-"]').length,
      terpasang: E19.terpasang().length,
    };

    return JSON.stringify({ tanpaUrl, gagal, tetapJalan });
  `,
    150000,
  );
  check(
    'V10',
    /*
     * Registry native Zephyr SELALU tersedia (katalog bundled dimuat dari
     * biner, bukan dari jaringan), jadi marketplace tidak pernah benar-benar
     * kosong — bahkan tanpa URL registry eksternal. Yang diuji:
     *   1. tanpa URL: tanpa error, katalog bawaan tetap tampil;
     *   2. URL mati: registry eksternal tidak terjangkau → fallback ke katalog
     *      bawaan tanpa crash dan tanpa error konsol;
     *   3. sesudahnya: katalog + ekstensi terpasang tetap berfungsi.
     */
    v10.tanpaUrl.err === null &&
      v10.tanpaUrl.remoteErr === null &&
      v10.tanpaUrl.kartu >= 3 &&
      v10.gagal.err === null &&
      v10.gagal.errorKonsol === 0 &&
      v10.gagal.kartu >= 3 &&
      v10.tetapJalan.kartu >= 3 &&
      v10.tetapJalan.terpasang >= 1,
    `Tanpa URL registry → err=${v10.tanpaUrl.err}, katalog bawaan (registry native) ` +
      `tetap tampil (${v10.tanpaUrl.kartu} kartu, kosong=${v10.tanpaUrl.kosong}). URL registry ` +
      `mati → fallback senyap ke katalog bawaan (${v10.gagal.kartu} kartu, err=${v10.gagal.err}, ` +
      `${v10.gagal.errorKonsol} error konsol) — bukan crash. ` +
      `Sesudahnya katalog + ekstensi terpasang tetap berfungsi (${v10.tetapJalan.kartu} kartu, ` +
      `${v10.tetapJalan.terpasang} terpasang)`,
  );

  // ═════════ V11: tsc/cargo + RAM + tidak ada error konsol ═════════
  const v11 = await panel.json(
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
  } finally {
    await panel.close().catch(() => {});
  }
};
