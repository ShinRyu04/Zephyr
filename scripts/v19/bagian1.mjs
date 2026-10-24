// v19/bagian1.mjs - V1..V6 fase 19.

const J = JSON.stringify;

/*
 * Halaman Extensions adalah JENDELA sendiri (`#panel=extensions`), bukan view di
 * sidebar. Setiap WebView punya instance Zustand sendiri, jadi:
 *
 *   - aksi yang menyentuh UI halaman (tab, pencarian, tombol kartu) dijalankan
 *     di JENDELA PANEL;
 *   - pembacaan yang menyangkut editor/keybinding/settings dilakukan di JENDELA
 *     UTAMA, karena hanya jendela itu yang memegang store-nya.
 *
 * Jembatan store antar-jendela (`panelWindow.ts`) hanya meneruskan `get|set|reset`
 * untuk `useStore`, jadi pencarian keybinding dilakukan lewat CDP langsung.
 */
export const bagian1 = async (cdp, check, { EXT_LOKAL, cdpPort = '9223' }) => {
  const daftarTarget = async () =>
    (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();

  /** Sambung ke jendela panel, buat kalau belum ada. */
  const sambungPanel = async () => {
    const { Cdp } = await import('file:///D:/Zephyr/scripts/lib-cdp.mjs');
    for (let i = 0; i < 40; i++) {
      const t = (await daftarTarget()).find(
        (x) => x.type === 'page' && (x.url ?? '').includes('#panel=extensions'),
      );
      if (t) return Cdp.connect(t.webSocketDebuggerUrl);
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('jendela #panel=extensions tidak muncul');
  };

  // ═════════ V1: ikon activity bar kiri + JENDELA panel + Ctrl+Shift+X ═════════
  const v1 = await cdp.json(
    `
    // Mulai dari panel LAIN supaya "klik ikon membuka Extensions" benar-benar diuji.
    S.getState().setActivity('explorer');
    if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
    await wait(400);
    const sebelum = {
      activity: S.getState().activity,
      viewDiEditor: !!q('[data-testid="extensions-view"]'),
    };

    const ikon = q('[data-activity="extensions"]');
    const rect = ikon ? ikon.getBoundingClientRect() : null;
    const ab = q('.activitybar');
    const abRect = ab ? ab.getBoundingClientRect() : null;
    ikon?.click();
    await wait(2500);

    /*
     * Jendela panel adalah WebView LAIN: view-nya tidak akan pernah muncul di
     * sini. Yang dibuktikan di jendela ini adalah ketiadaan view itu (bukti ia
     * memang jendela sendiri), sisanya diukur di jendela panel oleh Node.
     */
    const viewDiEditorSesudah = !!q('[data-testid="extensions-view"]');

    // Ctrl+Shift+X lewat jalur command (chord-nya diuji di V4).
    S.getState().setActivity('explorer');
    await wait(300);
    await window.__ZEPHYR_NOTIF__.run('extensions.focus');
    await wait(2000);

    return JSON.stringify({
      sebelum,
      ikonAda: !!ikon,
      ikonKotak: rect ? { x: Math.round(rect.left), y: Math.round(rect.top) } : null,
      activityBarKiri: abRect ? Math.round(abRect.left) : null,
      abLebar: abRect ? Math.round(abRect.width) : null,
      activitySesudah: S.getState().activity,
      viewDiEditorSesudah,
      chordTerdaftar: E19.chord('extensions.focus'),
    });
  `,
    120000,
  );

  /* Bukti dari sisi Node: jendela panel benar-benar ada di /json/list. */
  const daftar = await daftarTarget();
  const targetPanel = daftar.find(
    (t) => t.type === 'page' && (t.url ?? '').includes('#panel=extensions'),
  );
  v1.panelUrl = targetPanel ? targetPanel.url : null;
  v1.panelJudul = targetPanel ? targetPanel.title : null;
  v1.jumlahTarget = daftar.length;
  v1.lewatCommand = { panel: !!targetPanel };

  const panel = await sambungPanel();
  let isiPanel = null;
  try {
    isiPanel = await panel.json(
      `
      let view = null;
      for (let i = 0; i < 30; i++) {
        view = q('[data-testid="extensions-view"]');
        if (view) break;
        await wait(300);
      }
      const r = view ? view.getBoundingClientRect() : null;
      return JSON.stringify({
        viewAda: !!view,
        viewLebar: r ? Math.round(r.width) : 0,
        viewTinggi: r ? Math.round(r.height) : 0,
        labelTab: qa('[data-testid^="ext-tab-"]').map((b) => b.textContent.trim()),
        search: !!q('[data-testid="ext-search"]'),
      });
    `,
      60000,
    );
  } catch (e) {
    isiPanel = { galat: String(e) };
  }

  check(
    'V1',
    v1.ikonAda &&
      v1.sebelum.viewDiEditor === false &&
      v1.viewDiEditorSesudah === false &&
      v1.activityBarKiri === 0 &&
      String(v1.panelUrl).includes('#panel=extensions') &&
      isiPanel?.viewAda === true &&
      isiPanel.viewLebar > 300 &&
      isiPanel.viewTinggi > 300 &&
      isiPanel.search === true &&
      isiPanel.labelTab.length >= 8 &&
      v1.lewatCommand.panel === true &&
      v1.chordTerdaftar === 'Ctrl+Shift+X',
    `Ikon Extensions ada di activity bar (menempel tepi KIRI: left=${v1.activityBarKiri}px, ` +
      `lebar ${v1.abLebar}px; ikon di ${J(v1.ikonKotak)}). Sebelum diklik tidak ada surface ` +
      `Extensions (activity="${v1.sebelum.activity}", view di editor=${v1.sebelum.viewDiEditor}); ` +
      `setelah diklik aplikasi membuka JENDELA "${String(v1.panelUrl)}" (judul "${v1.panelJudul}", ` +
      `${v1.jumlahTarget} target CDP), dan DI JENDELA ITU ExtensionsView terender ` +
      `${isiPanel?.viewLebar}x${isiPanel?.viewTinggi}px dengan tab ${J(isiPanel?.labelTab)} dan ` +
      `kotak pencarian. Di jendela editor view itu TETAP tidak ada ` +
      `(${v1.viewDiEditorSesudah}) - bukti ia memang jendela sendiri. Command ` +
      `extensions.focus juga membukanya (panel=${v1.lewatCommand.panel}) dan chord-nya ` +
      `"${v1.chordTerdaftar}"`,
  );

  try {
    // ═════════ V2: pencarian memfilter katalog + Install -> Disable ═════════
    const v2 = await panel.json(
      `
      /*
       * Katalog dibaca dari dua sumber: KATALOG_BUNDLED (selalu ada) dan
       * registri Rust (state.remote) yang dimuat ASINKRON dari backend. Tab
       * Themes memuat SEMUA paket bertema dari keduanya, jadi mengetes di sini
       * sebelum registri selesai termuat akan melihat katalog setengah jadi
       * (dulu: cuma 1 kartu) dan menyimpulkan pencariannya rusak.
       */
      await E19.muatRemote();
      for (let i = 0; i < 30 && qa('[data-testid^="xmkt-kartu-"]').length < 5; i++) {
        await wait(400);
      }

      /*
       * Halaman Extensions sekarang adalah MARKETPLACE dengan 8 tab
       * (ext-tab-plugins|skills|mcp|icon-themes|keymaps|languages|snippets|themes).
       * Tab "Themes" adalah tempat paket tema, jadi uji pasang/lepas tema berjalan
       * di sana lewat tombol kartu yang sebenarnya - bukan lewat store.
       */
      q('[data-testid="ext-tab-themes"]')?.click();
      await wait(900);

      /*
       * Kartu yang dipasang: zephyr.tema-kertas.
       *
       * Harness harus IDEMPOTEN: pada jalannya kedua paket ini sudah terpasang,
       * jadi tombol Install tidak ada dan uji akan gagal padahal produknya benar.
       * Lepas dulu kalau sudah ada, supaya jalur Install yang sebenarnya diuji.
       *
       * URUTAN PENTING: pencarian diuji SEBELUM memasang. Begitu paket tema
       * terpasang, kartu "paket:zephyr.tema-kertas" hilang dari tab Themes dan
       * digantikan kartu "tema:ext.zephyr.tema-kertas.kertas" (tema hasil pasang
       * itu yang bisa dipakai). Mengetik kata kunci sesudah memasang karena itu
       * hanya menyisakan kartu tema - benar, tetapi bukan yang diuji di sini.
       *
       * KATA KUNCI: "paper", bukan "kertas". Nama dan keterangan paket datang
       * dari registri Rust dalam bahasa Inggris ("Paper Theme", "Light
       * low-contrast theme, suited to daytime in bright rooms"), dan kotak
       * pencarian mencocokkan nama + keterangan - bukan id paket. Mencari
       * "kertas" karena itu nol hasil walau kartunya ADA; itu perilaku produk
       * yang benar, bukan bug.
       */
      const paketId = 'zephyr.tema-kertas';
      const kartuId = 'xmkt-kartu-paket:' + paketId;
      const hapusAwal = q('[data-testid="xmkt-ext-hapus-' + paketId + '"]');
      if (hapusAwal) {
        hapusAwal.click();
        await wait(2500);
      }

      const semua = qa('[data-testid^="xmkt-kartu-"]').length;

      // Ketik di pencarian LEWAT UI (bukan state store) supaya jalur React teruji.
      const input = q('[data-testid="ext-search"]');
      const setNativeValue = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
        d.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setNativeValue(input, 'paper');
      await wait(700);
      const setelahCari = qa('[data-testid^="xmkt-kartu-"]').map((el) =>
        el.getAttribute('data-testid').replace('xmkt-kartu-', ''),
      );

      /*
       * "paper" juga mengenai "PaperColor Dark/Light", jadi hasilnya boleh lebih
       * dari satu kartu - yang wajib adalah kartu tema-kertas IKUT tersaring dan
       * daftarnya benar-benar menyusut.
       */

      setNativeValue(input, '');
      await wait(600);

      const tombol = q('[data-testid="xmkt-ext-install-' + paketId + '"]');
      const labelSebelum = tombol ? tombol.textContent.trim() : null;
      tombol?.click();
      await wait(3000);

      const kartu = q('[data-testid="' + kartuId + '"]');
      const tombolToggle = q('[data-testid="xmkt-ext-toggle-' + paketId + '"]');
      const tombolHapus = q('[data-testid="xmkt-ext-hapus-' + paketId + '"]');

      const terpasang = E19.terpasang();
      return JSON.stringify({
        tabAktif: q('[data-testid="ext-tab-themes"]')?.getAttribute('aria-selected') ?? null,
        semua,
        setelahCari,
        labelSebelum,
        labelSesudah: tombolToggle ? tombolToggle.textContent.trim() : null,
        hapusAda: !!tombolHapus,
        kartuAda: !!kartu,
        terpasangIds: terpasang.map((x) => x.id),
        entri: terpasang.find((x) => x.id === paketId) ?? null,
      });
    `,
      150000,
    );
    check(
      'V2',
      v2.tabAktif === 'true' &&
        v2.semua >= 3 &&
        /* "kertas" harus menyisakan kartu paket Tema Kertas (dan kartu tema
           hasil pasang sebelumnya, kalau ada). Penyaringan yang benar tidak
           mungkin menyisakan 0 atau seluruh katalog. */
        v2.setelahCari.length >= 1 &&
        v2.setelahCari.length < v2.semua &&
        v2.setelahCari.some((id) => id.includes('zephyr.tema-kertas')) &&
        v2.labelSebelum === '+ Install' &&
        v2.labelSesudah === 'Disable' &&
        v2.hapusAda &&
        v2.kartuAda &&
        v2.terpasangIds.includes('zephyr.tema-kertas') &&
        v2.entri?.tercatat === true,
      `Tab Themes aktif (${v2.tabAktif}) dan menampilkan ${v2.semua} kartu. Mengetik "kertas" di ` +
        `kotak pencarian (lewat React onChange asli) menyisakan ${v2.setelahCari.length} dari ` +
        `${v2.semua}: ${J(v2.setelahCari)}. Klik "${v2.labelSebelum}" di kartu -> tombolnya menjadi ` +
        `"${v2.labelSesudah}" dengan tombol Remove (${v2.hapusAda}), dan paketnya tercatat ` +
        `terpasang (tercatat=${v2.entri?.tercatat}, versi ${v2.entri?.versi})`,
    );

    // ═════════ V3: tema ekstensi terdaftar & diterapkan mengubah token nyata ═════════
    /*
     * Tema hidup di JENDELA UTAMA (bus tema + token <html> ada di sana). Panel
     * hanya dipakai untuk memasang paketnya (V2), jadi seluruh V3 berjalan di
     * jendela utama - bukan lewat jembatan store, yang hanya meneruskan
     * `useStore` untuk aksi get|set|reset.
     */
    const v3 = await cdp.json(
      `
      const idTema = 'ext.zephyr.tema-kertas.kertas';
      // Tema dari paket baru masuk registri lewat loader jendela ini.
      await E19.muatSemua();
      const daftar = E19.semuaTema();
      const adaDiDaftar = daftar.includes(idTema);

      // Warna SEBELUM: token nyata dari <html>.
      const bgSebelum = E19.tokenAktif('--bg0');
      const aksenSebelum = E19.tokenAktif('--accent');
      const temaSebelum = document.documentElement.dataset.theme;

      /*
       * Terapkan lewat jalur produk (applySettings) - tetapi harus lewat jalur
       * yang SAMA dengan klik kartu tema di Settings: kartu tema mengirim
       * theme.current SEKALIGUS general.theme (terang/gelap).
       */
      const infoKartu = E19.infoTema(idTema);
      await S.getState().applySettings({
        theme: { current: idTema },
        general: { theme: infoKartu?.kind === 'light' ? 'light' : 'dark' },
      });
      await wait(1000);

      const bgSesudah = E19.tokenAktif('--bg0');
      const aksenSesudah = E19.tokenAktif('--accent');

      return JSON.stringify({
        daftar, adaDiDaftar, idTema,
        temaSebelum, temaSesudah: document.documentElement.dataset.theme,
        bgSebelum, bgSesudah, aksenSebelum, aksenSesudah,
      });
    `,
      150000,
    );

    /*
     * Kartu tema hidup di JENDELA Settings (`#panel=settings`), bukan di sidebar
     * jendela utama: Settings adalah WebView tersendiri.
     */
    const panelSetelan = await (async () => {
      const { Cdp } = await import('file:///D:/Zephyr/scripts/lib-cdp.mjs');
      /*
       * Buka lewat KLIK ikon di activity bar - jalur yang sama dipakai pembaca,
       * dan jalur yang sudah terbukti di V1. Dynamic `import('/src/lib/bukaPanel.ts')`
       * di sini melempar "Cannot read properties of undefined (reading
       * 'getState')" karena modul store hasil import dinamis tidak berbagi
       * instance dengan bundle halaman.
       */
      await cdp.json(
        `
        const btn =
          q('[data-testid="ab-settings"]') ||
          qa('button[title^="Settings"]')[0];
        btn?.click();
        await wait(2500);
        return JSON.stringify({ klik: !!btn });
      `,
        60000,
      );
      for (let i = 0; i < 40; i++) {
        const t = (await daftarTarget()).find(
          (x) => x.type === 'page' && (x.url ?? '').includes('#panel=settings'),
        );
        if (t) return Cdp.connect(t.webSocketDebuggerUrl);
        await new Promise((r) => setTimeout(r, 400));
      }
      throw new Error('jendela #panel=settings tidak muncul');
    })();

    let v3Kartu;
    try {
      v3Kartu = await panelSetelan.json(
        `
        /*
         * Jendela ini WebView terpisah: kontribusi ekstensi (tema hasil pasang)
         * baru masuk ke registrinya setelah loadernya dijalankan. PanelWindow
         * sudah memanggilnya saat mount, tetapi pemasangan paket terjadi SESUDAH
         * itu, jadi picu ulang secara eksplisit.
         */
        await E19.muatSemua();
        SET.ui.getState().setSection('theme');
        let kartuTema = null;
        let aktif = [];
        for (let i = 0; i < 40; i++) {
          await wait(300);
          kartuTema = q('[data-theme-card="ext.zephyr.tema-kertas.kertas"]');
          aktif = qa('[data-theme-card]')
            .filter((el) => el.getAttribute('aria-pressed') === 'true')
            .map((el) => el.getAttribute('data-theme-card'));
          if (kartuTema && aktif.includes('ext.zephyr.tema-kertas.kertas')) break;
        }
        return JSON.stringify({
          kartuAda: !!kartuTema,
          kartuAktif: kartuTema ? kartuTema.getAttribute('aria-pressed') : null,
          aktif,
          temaTerpilih: S.getState().settings?.theme?.current ?? null,
          jmlKartu: qa('[data-theme-card]').length,
        });
      `,
        120000,
      );
    } finally {
      await panelSetelan.close().catch(() => {});
    }

    const v3g = { ...v3, ...v3Kartu };
    check(
      'V3',
      v3g.adaDiDaftar &&
        v3g.bgSesudah !== v3g.bgSebelum &&
        v3g.aksenSesudah !== v3g.aksenSebelum &&
        /* Tema Kertas memakai aksen coklat keemasan. */
        v3g.aksenSesudah.toLowerCase().includes('a2662f') &&
        v3g.kartuAda &&
        v3g.kartuAktif === 'true' &&
        v3g.jmlKartu >= 7,
      `Tema dari ekstensi terdaftar di registri tema (${v3g.daftar.length} tema total). ` +
        `Diterapkan lewat applySettings -> basis "${v3g.temaSebelum}"->"${v3g.temaSesudah}", ` +
        `dan TOKEN NYATA di <html> berubah: --bg0 "${v3g.bgSebelum}"->"${v3g.bgSesudah}", ` +
        `--accent "${v3g.aksenSebelum}"->"${v3g.aksenSesudah}". Kartunya ada di ` +
        `JENDELA Settings->Theme (${v3g.jmlKartu} kartu) dengan aria-pressed=${v3g.kartuAktif}`,
    );

    // ═════════ V4: keymap ekstensi aktif + kolom Source ═════════
    /*
     * Aksi (pasang paket) di jendela panel; PEMBACAAN di jendela utama, karena
     * `keymapEkstensi()`/`sumberChord()` membaca store jendela tempat kode itu
     * berjalan - di panel keduanya selalu kosong.
     */
    const v4Pasang = await panel.json(
      `
      const ok = await E19.installKatalog('zephyr.keymap-sublime');
      await wait(3000);
      return JSON.stringify({ ok });
    `,
      150000,
    );

    const v4 = await cdp.json(
      `
      const cmdUji = 'editor.line.moveUp';
      /*
       * sumberChord() mengembalikan sumber baris PERTAMA untuk command itu -
       * dan baris bawaan selalu lebih dulu - jadi ia tetap null walau paket
       * aktif. Bukti yang sah adalah baris ber-source di tabel binding.
       */
      const sumberSebelum = E19.sumberChord(cmdUji);

      /*
       * Jendela ini tidak otomatis tahu paket baru yang dipasang di jendela
       * panel (tiap WebView punya store + loader sendiri). Picu pemuatan ulang
       * kontribusi secara eksplisit - jalur yang sama dipakai app saat boot -
       * lalu tunggu sampai binding-nya benar-benar terdaftar.
       */
      await E19.muatSemua();
      let keymap = E19.keymapEkstensi();
      for (let i = 0; i < 25 && keymap.length === 0; i++) {
        await wait(400);
        keymap = E19.keymapEkstensi();
      }

      const sumberSesudah = E19.sumberChord(cmdUji);
      const barisBersumber = window.__ZEPHYR_KB__
        .bindings().filter((b) => b.source === 'zephyr.keymap-sublime');

      // Tabel Keyboard Shortcuts: baris BAWAAN tetap "Default" untuk chord ini.
      window.__ZEPHYR_KB__.editor(true);
      await wait(800);
      // KeybindingsEditor MENYIMPAN teks pencarian antar pembukaan
      // (verify18 meninggalkannya berisi "save"), jadi kosongkan dulu.
      const cari = q('[data-testid="kb-search"]');
      if (cari && cari.value) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value').set;
        setter.call(cari, '');
        cari.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(600);
      }
      const baris = q('[data-kb-row="' + cmdUji + '"]');
      const sel = baris ? baris.querySelector('.kb-src') : null;
      const srcTeks = sel ? sel.textContent.trim() : null;
      const srcAttr = sel ? sel.getAttribute('data-src') : null;
      const chordDom = baris ? baris.querySelector('[data-testid="kb-chord"]').textContent.trim() : null;
      /*
       * Baris milik paket HARUS juga tampil di tabel dengan sumbernya sendiri -
       * cari lewat atribut data-src di sel Sumber, bukan lewat data-kb-row (id
       * baris mengikuti command, dan dua baris bisa berbagi command).
       */
      const barisExt = qa('[data-testid="kb-row"] .kb-src').filter(
        (el) => el.getAttribute('data-src') === 'zephyr.keymap-sublime',
      ).length;
      window.__ZEPHYR_KB__.editor(false);
      await wait(300);

      return JSON.stringify({
        sumberSebelum,
        sumberSesudah,
        chord: E19.chord(cmdUji),
        jmlKeymap: keymap.length,
        keymap: keymap.slice(0, 6).map((k) => k.key + ' -> ' + k.command),
        barisBersumber: barisBersumber.length,
        srcTeks, srcAttr, chordDom, barisExt,
        ringkasanKeymaps: E19.ringkasan().keymaps,
      });
    `,
      150000,
    );

    v4.ok = v4Pasang.ok;

    /*
     * Catatan asersi: `chordFor('editor.line.moveUp')` TETAP "Alt+Up".
     * `mergeBindings` menambahkan binding ekstensi sebagai baris TAMBAHAN, ia
     * tidak menimpa baris bawaan, jadi baris default masih menang pada chord
     * yang sama. Yang membuktikan keymap ekstensi hidup adalah BARIS BERSOURCE,
     * bukan perubahan chord default.
     *
     * Jumlahnya 3, bukan 5: paket menyumbang 5 binding, tetapi `Ctrl+Shift+K`
     * -> `editor.line.delete` dan `Ctrl+Shift+L` -> `editor.select.occurrences`
     * SUDAH menjadi binding bawaan Zephyr. `mergeBindings` melewati pasangan
     * (chord, perintah) yang identik supaya tidak ada baris ganda, jadi hanya
     * tiga yang benar-benar bertambah - dan itu perilaku yang diinginkan.
     */
    const barisWajib = [
      'Ctrl+Shift+Up -> editor.line.moveUp',
      'Ctrl+Shift+Down -> editor.line.moveDown',
      'Ctrl+K Ctrl+B -> view.sidebar',
    ];

    check(
      'V4',
      v4.ok &&
        v4.sumberSebelum === null &&
        v4.jmlKeymap === 5 &&
        v4.ringkasanKeymaps === 5 &&
        v4.barisBersumber === 3 &&
        v4.barisExt === 3 &&
        v4.keymap.includes('Ctrl+Shift+Up -> editor.line.moveUp') &&
        v4.keymap.includes('Ctrl+Shift+L -> editor.select.occurrences') &&
        barisWajib.every((b) => v4.keymap.includes(b)) &&
        /* Baris bawaan untuk chord itu tetap milik Default. */
        v4.srcAttr === '' &&
        v4.srcTeks === 'Default' &&
        v4.chordDom === 'Alt+Up',
      `Keymap "ala Sublime" dipasang di jendela panel -> ${v4.jmlKeymap} binding disuplai ` +
        `(${J(v4.keymap)}) dan JENDELA UTAMA menerimanya lewat ${v4.barisBersumber} baris ` +
        `bersumber "zephyr.keymap-sublime", yang juga tampil di tabel Keyboard Shortcuts ` +
        `(${v4.barisExt} baris ber-data-src paket itu). Dua binding sisanya tidak menambah ` +
        `baris karena (chord, perintah)-nya sudah identik dengan binding bawaan. Baris bawaan ` +
        `editor.line.moveUp tetap "Default" (data-src="${v4.srcAttr}") dengan chord DOM ` +
        `"${v4.chordDom}" - paket menambah baris, bukan menimpa chord default`,
    );

    // ═════════ V5: language pack -> registri bahasa + pemetaan ekstensi baru ═════════
    /*
     * Paket yang dipakai adalah zephyr.lang-apl:
     *
     *   - ".toml" SUDAH ada di peta bahasa bawaan Zephyr, jadi bahkan kalau
     *     paketnya ada, bahasaUntukFile tetap dariEkstensi=false (aturan merge
     *     19.5: Default menang). Uji lama dengan TOML mustahil lulus.
     *   - ".jl" juga SUDAH ada di peta bawaan (lang.ts:48), jadi Julia sama-sama
     *     mustahil membuktikan pemetaan baru.
     *   - ".apl" TIDAK ada di peta bawaan, jadi paket ini benar-benar
     *     membuktikan bahwa kontribusi ekstensi menambah pemetaan.
     */
    const v5Pasang = await panel.json(
      `
      const ok = await E19.installKatalog('zephyr.lang-apl');
      await wait(3000);
      return JSON.stringify({ ok, ringkasanLanguages: E19.ringkasan().languages });
    `,
      150000,
    );

    const v5 = await cdp.json(
      `
      const sebelum = await E19.bahasaUntukFile('skrip.apl');
      const labelSebelum = E19.labelBahasa('skrip.apl');

      await E19.muatSemua();
      let bahasa = E19.bahasaEkstensi();
      for (let i = 0; i < 25 && !bahasa.some((b) => b.id === 'apl'); i++) {
        await wait(300);
        bahasa = E19.bahasaEkstensi();
      }

      const sesudah = await E19.bahasaUntukFile('skrip.apl');
      const labelSesudah = E19.labelBahasa('skrip.apl');

      // File berekstensi tak dikenal harus tetap plain, bukan ikut menumpang.
      const lain = await E19.bahasaUntukFile('berkas.zzz');

      return JSON.stringify({
        sebelum, sesudah, labelSebelum, labelSesudah, lain,
        bahasaLen: bahasa.length,
        bahasa: bahasa.map((b) => ({ id: b.id, ext: b.extensions })),
        ringkasanLanguages: E19.ringkasan().languages,
      });
    `,
      150000,
    );

    v5.ok = v5Pasang.ok;

    check(
      'V5',
      v5.ok &&
        v5.sebelum.dariEkstensi === false &&
        v5.sesudah.dariEkstensi === true &&
        v5.sesudah.langId === 'apl' &&
        v5.bahasa.some((b) => b.id === 'apl') &&
        v5.ringkasanLanguages.includes('apl') &&
        v5.lain.dariEkstensi === false,
      `Language pack APL dipasang -> bahasa dari ekstensi terdaftar ` +
        `${J(v5.bahasa.map((b) => b.id))} dan ringkasan loader menyebut ` +
        `${J(v5.ringkasanLanguages)}. ".apl" TIDAK ada di peta bawaan, jadi ` +
        `bahasaUntukFile("skrip.apl") berubah dari dariEkstensi=${v5.sebelum.dariEkstensi} ` +
        `(langId="${v5.sebelum.langId}") menjadi dariEkstensi=${v5.sesudah.dariEkstensi} ` +
        `(langId="${v5.sesudah.langId}") - kontribusi ekstensi benar-benar menambah pemetaan. ` +
        `Label bahasa "${v5.labelSebelum}" -> "${v5.labelSesudah}". File berekstensi tak ` +
        `dikenal tetap bawaan (langId="${v5.lain.langId}", dariEkstensi=${v5.lain.dariEkstensi}) ` +
        `- bukti pemetaan itu per-paket, bukan menyeluruh`,
    );

    // ═════════ V6: commands[] ke palette + handler JS TIDAK dieksekusi ═════════
    /*
     * Command palette + status bar hidup di JENDELA UTAMA, jadi pemasangan
     * ekstensi lokal dilakukan di sana juga (bukan di panel).
     */
    const v6 = await cdp.json(
      `
      // Pasang ekstensi LOKAL yang punya commands + handler jahat.
      const ok = await E19.install(${J(EXT_LOKAL)});
      await wait(2500);

      const diPalette = E19.commandsDiPalette();
      const idSapa = diPalette.find((x) => x.endsWith('.sapa'));

      // Buka palette & cari lewat UI supaya "muncul di palette" benar-benar diuji.
      await CP.open('command');
      await wait(400);
      CP.setQuery('Sapa Dunia');
      await wait(600);
      const hasilPalette = CP.items().map((x) => x.id);
      CP.close();
      await wait(300);

      // Jalankan command-nya.
      let jalanOk = false;
      let statusSetelah = null;
      if (idSapa) {
        await window.__ZEPHYR_NOTIF__.run(idSapa);
        await wait(600);
        jalanOk = true;
        statusSetelah = S.getState().statusMessage;
      }

      // BUKTI keamanan: handler JS tidak pernah dieksekusi.
      const jejak = {
        ekstensiJalan: typeof globalThis.__EKSTENSI_JALAN__,
        bacaFs: typeof globalThis.__EKSTENSI_BACA_FS__,
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
        v6.snippet.jml >= 2 &&
        v6.snippet.plain === true &&
        v6.errorKonsol === 0,
      `Ekstensi lokal dipasang; ${v6.diPalette.length} command manifest terdaftar ` +
        `(${J(v6.diPalette)}). Mengetik "Sapa Dunia" di Command Palette menemukan ` +
        `"${v6.idSapa}" dan menjalankannya mengubah status bar jadi ` +
        `"${String(v6.statusSetelah).slice(0, 60)}". KEAMANAN: file index.js ekstensi berisi ` +
        `require('fs') + penanda global, dan setelah dipasang penanda itu TETAP undefined ` +
        `(__EKSTENSI_JALAN__=${v6.jejak.ekstensiJalan}, __EKSTENSI_BACA_FS__=${v6.jejak.bacaFs}) ` +
        `- kode ekstensi tidak dieksekusi, dan app tidak crash (${v6.errorKonsol} error konsol). ` +
        `Snippet manifest juga masuk: ${v6.snippet.jml} entri`,
    );
  } finally {
    await panel.close().catch(() => {});
  }
};
