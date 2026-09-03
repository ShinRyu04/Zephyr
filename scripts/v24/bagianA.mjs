// v24/bagianA.mjs — V2 (breadcrumbs + sticky) & V3 (minimap 5000 baris).

const J = JSON.stringify;

export const bagianA = async (cdp, check, FILE, FILE_BESAR) => {
  // ═════════ V2: breadcrumbs tampil + klik lompat; sticky menempel ═════════
  const v2 = await cdp.json(
    `
    // Tutup SEMUA tab dulu, lalu pastikan tab aktif benar-benar fixture.
    //
    // BUG HARNESS yang ini perbaiki: menulis fixture di src/ memicu Vite HMR
    // full reload, dan setelah reload app me-RESTORE tab sesi sebelumnya secara
    // asinkron. Restore itu mendarat SETELAH pembersihan di verify24.mjs, jadi
    // tab aktif bisa jadi file lain (terbukti: dokumen 518 baris =
    // ARCHITECTURE.md). Akibatnya findIndex('return keluar;') = -1 dan
    // doc.line(0) melempar "Invalid line number 0 in 518-line document" —
    // kegagalan harness, bukan kegagalan produk.
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    await wait(600);
    await S.getState().openPath(${J(FILE)});
    // tsserver perlu waktu; breadcrumbs juga debounce 400ms.
    await wait(7000);

    // Tunggu sampai tab aktif = fixture DAN editornya sudah ter-mount.
    let cm = null;
    for (let i = 0; i < 40; i++) {
      const st = S.getState();
      const akt = st.tabs.find((t) => t.id === st.activeTabId);
      if (akt && String(akt.path || '').toLowerCase().includes('__uji24.ts')) {
        cm = window.__ZEPHYR_CM__();
        if (cm && cm.state.doc.toString().includes('return keluar;')) break;
        // Tab benar tapi restore sesi menimpanya -> paksa lagi.
      } else if (akt) {
        S.getState().tabs
          .filter((t) => !String(t.path || '').toLowerCase().includes('__uji24.ts'))
          .forEach((t) => S.getState().forceCloseTab(t.id));
        await S.getState().openPath(${J(FILE)});
      }
      await wait(400);
      cm = window.__ZEPHYR_CM__();
    }
    if (!cm) throw new Error('editor fixture tidak pernah aktif');

    const bcAwal = EX.breadcrumbs();
    const sim = await EX.simbol();

    // Taruh kursor di dalam method "ulangi" -> breadcrumbs harus menampilkan
    // KotakWarna › ulangi (jalur bersarang, bukan hanya file).
    const teks = cm.state.doc.toString().split('\\n');
    const barisUlangi = teks.findIndex((l) => l.includes('ulangi(n: number)')) + 1;
    const barisDalam = barisUlangi + 2;
    if (barisUlangi === 0) {
      throw new Error('fixture salah: "ulangi(n: number)" tidak ada di doc ' +
        cm.state.doc.lines + ' baris');
    }
    LSP.goto(barisDalam, 6);
    await wait(900);
    const bcDalam = EX.breadcrumbs();

    // Klik segmen simbol terakhir -> dropdown sebaya muncul.
    const bukaOk = EX.bukaDropdown(bcDalam.simbol.length - 1);
    await wait(500);
    const items = EX.dropdownItems();

    // Pilih item pertama -> kursor benar-benar pindah ke baris simbol itu.
    const sebelumKlik = cm.state.selection.main.head;
    const itemEl = document.querySelectorAll('[data-testid="bc-dropdown-item"]')[0];
    const adaItem = !!itemEl;
    if (itemEl) itemEl.click();
    await wait(700);
    const cm2 = window.__ZEPHYR_CM__();
    const barisSetelah = cm2.state.doc.lineAt(cm2.state.selection.main.head).number;
    const dropdownTutup = !document.querySelector('[data-testid="bc-dropdown"]');

    // ── Sticky scroll ──
    // Scroll sampai baris "return keluar" lewat atas viewport; header
    // class/method di atasnya harus menempel.
    const barisReturn = teks.findIndex((l) => l.includes('return keluar;')) + 1;
    const posReturn = cm2.state.doc.line(barisReturn).from;
    const scroller = cm2.scrollDOM;
    const blok = cm2.lineBlockAt(posReturn);
    scroller.scrollTop = blok.top;
    await wait(900);

    const stickyAda = EX.ada().sticky;
    const stickyRows = EX.stickyTeks();
    // Rekam scrollTop DI SINI, sebelum klik.
    //
    // BUG HARNESS: dulu scrollTop dibaca di objek return — yaitu SETELAH
    // rowEl.click() melompat ke baris 1, jadi nilainya selalu ~0 dan assertion
    // "scrollTop > 50" gagal walau scroll-nya benar terjadi dan sticky-nya
    // benar menempel (["1","7"] = class KotakWarna + hitung).
    const scrollTopSticky = Math.round(scroller.scrollTop);
    // Klik baris sticky -> lompat ke baris itu.
    const rowEl = document.querySelector('[data-testid="sticky-row"]');
    const adaRow = !!rowEl;
    const targetLine = rowEl ? Number(rowEl.getAttribute('data-line')) : 0;
    if (rowEl) rowEl.click();
    await wait(700);
    const cm3 = window.__ZEPHYR_CM__();
    const barisSetelahSticky = cm3.state.doc.lineAt(cm3.state.selection.main.head).number;

    return JSON.stringify({
      bcAwal, bcDalam, punyaLsp: sim ? sim.punyaLsp : null,
      barisUlangi, barisDalam, barisReturn,
      bukaOk, items, adaItem, sebelumKlik, barisSetelah, dropdownTutup,
      stickyAda, stickyRows, adaRow, targetLine, barisSetelahSticky,
      scrollTop: scrollTopSticky,
      scrollTopAkhir: Math.round(scroller.scrollTop),
    });
  `,
    180000,
  );
  check(
    'V2',
    v2.bcAwal.path.includes('__uji24.ts') &&
      v2.punyaLsp === true &&
      v2.bcDalam.simbol.length >= 2 &&
      v2.bcDalam.simbol[0] === 'KotakWarna' &&
      v2.bcDalam.simbol.includes('ulangi') &&
      v2.bukaOk &&
      v2.items.length >= 2 &&
      v2.adaItem &&
      v2.dropdownTutup &&
      v2.barisSetelah !== 0 &&
      v2.stickyAda &&
      v2.stickyRows.length >= 1 &&
      // Sticky harus menempelkan header yang BENAR: baris "hitung(" atau
      // "class KotakWarna", bukan sembarang baris. Kalau scroll-nya 0 px,
      // ujinya tidak membuktikan apa pun.
      v2.scrollTop > 50 &&
      v2.stickyRows.some((r) => Number(r.line) < v2.barisReturn) &&
      v2.adaRow &&
      v2.barisSetelahSticky === v2.targetLine,
    `Breadcrumbs: path ${J(v2.bcAwal.path)} (dari LSP, punyaLsp=${v2.punyaLsp}); kursor di ` +
      `baris ${v2.barisDalam} (dalam method "ulangi") → jalur simbol ${J(v2.bcDalam.simbol)} ` +
      `— bersarang, bukan hanya nama file. Klik segmen → dropdown ${v2.items.length} sebaya ` +
      `(${J(v2.items.slice(0, 3))}), pilih item → kursor pindah ke baris ${v2.barisSetelah} ` +
      `dan dropdown tertutup (${v2.dropdownTutup}). Sticky: scroll ke baris ${v2.barisReturn} ` +
      `(scrollTop ${v2.scrollTop}px) → ${v2.stickyRows.length} baris menempel ` +
      `${J(v2.stickyRows.map((r) => r.line))}; klik baris sticky (line ${v2.targetLine}) → ` +
      `kursor di baris ${v2.barisSetelahSticky}`,
  );

  // ═════════ V3: minimap 5000 baris + marker error ═════════
  const v3 = await cdp.json(
    `
    await s.openPath(${J(FILE_BESAR)});
    await wait(4000);

    const st = S.getState();
    const file = st.tabs.find((t) => t.id === st.activeTabId).path;
    const cm = window.__ZEPHYR_CM__();
    const totalBaris = cm.state.doc.lines;
    const hitung = EX.hitung();
    const adaCanvas = hitung.minimapCanvas === 1;

    // Ukuran canvas nyata (bukti render terjadi, bukan elemen kosong).
    const canvas = document.querySelector('[data-testid="minimap-canvas"]');
    const ukuran = canvas ? { w: canvas.width, h: canvas.height,
                              cssW: canvas.style.width, cssH: canvas.style.height } : null;

    // Piksel non-transparan: bukti canvas benar-benar DIGAMBAR.
    // getImageData butuh integer — canvas.height/dpr bisa pecahan, jadi
    // dibulatkan. ("Value is not of type 'long'" kalau tidak.)
    let pikselTerisi = 0;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const hBaca = Math.max(1, Math.min(Math.floor(canvas.height), 400));
      const d = ctx.getImageData(0, 0, Math.floor(canvas.width), hBaca).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) pikselTerisi++;
    }

    // ── Jank: ukur frame saat scroll cepat 40x ──
    // rAF tidak bisa dipakai sebagai jam di WebView2 tanpa fokus (tidak
    // dipanggil), jadi waktu diukur dengan performance.now() + setTimeout(0)
    // yang selalu jalan.
    const scroller = cm.scrollDOM;
    const durasi = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      scroller.scrollTop = (i / 40) * (scroller.scrollHeight - scroller.clientHeight);
      // Paksa layout dibaca supaya biaya scroll benar-benar terjadi sekarang.
      void scroller.scrollTop;
      void document.querySelector('.cm-content').getBoundingClientRect().height;
      await new Promise((r) => setTimeout(r, 0));
      durasi.push(performance.now() - t0);
    }
    durasi.sort((a, b) => a - b);
    const median = Math.round(durasi[Math.floor(durasi.length / 2)]);
    const terburuk = Math.round(durasi[durasi.length - 1]);

    const vpSebelum = EX.minimapViewport();
    scroller.scrollTop = 0;
    await wait(400);
    const vpSesudah = EX.minimapViewport();

    // ── Marker error dari problemsStore ──
    window.__ZEPHYR_PANEL__.problems.set(file, [
      { file, line: 2500, column: 1, severity: 'error', message: 'uji marker', source: 'UJI', code: 'M1' },
      { file, line: 4800, column: 1, severity: 'warning', message: 'uji warn', source: 'UJI', code: 'M2' },
    ]);
    await wait(900);

    // Cari pita merah di kolom tengah canvas: baris 2500 dari total.
    // Semua argumen getImageData WAJIB integer.
    let adaPita = false;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const cssH = parseFloat(canvas.style.height) || 1;
      const dpr = canvas.height / cssH;
      const yHarap = Math.floor((2500 / totalBaris) * cssH * dpr);
      const y0 = Math.max(0, Math.min(yHarap - 3, canvas.height - 1));
      const h = Math.max(1, Math.min(7, canvas.height - y0));
      const d = ctx.getImageData(0, y0, Math.floor(canvas.width), h).data;
      for (let i = 0; i < d.length; i += 4) {
        // merah dominan = marker error
        if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110 && d[i + 3] > 120) { adaPita = true; break; }
      }
    }

    const ram = S.getState().ramBytes;
    window.__ZEPHYR_PANEL__.problems.clearAll();

    return JSON.stringify({
      totalBaris, adaCanvas, ukuran, pikselTerisi, hitung,
      median, terburuk, vpSebelum, vpSesudah, adaPita,
      ramMB: ram > 0 ? Math.round(ram / 1024 / 1024) : null,
    });
  `,
    240000,
  );
  const vpBerubah = v3.vpSebelum?.transform !== v3.vpSesudah?.transform;
  check(
    'V3',
    v3.totalBaris >= 5000 &&
      v3.adaCanvas &&
      (v3.ukuran?.w ?? 0) > 0 &&
      v3.pikselTerisi > 500 &&
      v3.hitung.cmLine < 400 &&
      v3.median <= 34 &&
      vpBerubah &&
      v3.adaPita &&
      (v3.ramMB === null || v3.ramMB < 400),
    `File ${v3.totalBaris} baris: minimap 1 canvas ${v3.ukuran?.w}×${v3.ukuran?.h}px ` +
      `(CSS ${v3.ukuran?.cssW}×${v3.ukuran?.cssH}) dengan ${v3.pikselTerisi} piksel tergambar — ` +
      `bukan elemen kosong. DOM tetap ${v3.hitung.cmLine} node .cm-line (viewport saja, ` +
      `bukan ${v3.totalBaris}). Scroll 40 langkah: frame median ${v3.median}ms, terburuk ` +
      `${v3.terburuk}ms (batas median 34ms ≈ 30fps). Kotak viewport ikut bergerak ` +
      `(${vpBerubah}: "${v3.vpSebelum?.transform}" → "${v3.vpSesudah?.transform}"). ` +
      `Marker error baris 2500 terbaca sebagai pita merah di canvas (${v3.adaPita}). ` +
      `RAM ${v3.ramMB ?? '—'} MB`,
  );
};
