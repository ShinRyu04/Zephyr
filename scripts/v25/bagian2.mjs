// v25/bagian2.mjs — V4..V7 fase 25.

const J = JSON.stringify;

export const bagian2 = async (cdp, check, F) => {
  // ═════════ V4: Replace All bisa di-undo (snapshot sebelum tulis) ═══════════
  //
  // Snapshot dibuat di Rust (`search_replace` → `history::snapshot_internal`,
  // reason 'before-replace') SEBELUM std::fs::write. Undo memulihkannya lewat
  // historyStore.restore, yang mengisi BUFFER editor dan menandainya dirty —
  // bukan menulis disk. Itu keputusan fase 26 dan tetap berlaku di sini:
  // user harus melihat apa yang akan kembali sebelum menimpanya.
  const v4 = await cdp.json(
    `
    const FILE = ${J(F.a)};

    SR.bersihkan();
    SR.setRoot(${J(F.dir)});
    SR.setFlag({ regex: false, caseSensitive: true, wholeWord: false, respectGitignore: true });
    SR.setQuery('alpha');
    SR.setReplaceWith('OMEGA');
    await SR.jalankan();
    await wait(600);

    const isiSebelum = (await window.__ZEPHYR_FS__.read(FILE)).content;
    const hitSebelum = SR.jumlahHit();

    const nGanti = await SR.replaceSemua();
    await wait(1000);

    const isiSesudah = (await window.__ZEPHYR_FS__.read(FILE)).content;
    const jejak = SR.replaceTerakhir();

    // Snapshot 'before-replace' harus benar-benar ada di Local History.
    // HistoryInfo memakai field snapshots (bukan entries) — lihat history.rs
    // struct HistoryInfo { dir, snapshots, skip }. Tanpa backtick: komentar ini
    // ada DI DALAM template literal.
    await HS.muat(FILE);
    await wait(500);
    const info = await HS.list(FILE);
    const daftarSnap = (info && info.snapshots) || [];
    const adaBeforeReplace = daftarSnap.filter((s) => s.reason === 'before-replace').length;

    // ── undo ──
    const nUndo = await SR.undoReplace();
    await wait(900);

    const S2 = S.getState();
    const kunci = (p) => (p || '').replace(/\\\\/g, '/').toLowerCase();
    const tab = S2.tabs.find((t) => kunci(t.path) === kunci(FILE));
    const isiBuffer = tab ? tab.content : null;
    const dirty = tab ? tab.unsaved : null;
    // Disk BELUM berubah oleh undo — itu memang perilaku yang diinginkan.
    const isiDiskSetelahUndo = (await window.__ZEPHYR_FS__.read(FILE)).content;

    return JSON.stringify({
      isiSebelum,
      hitSebelum,
      nGanti,
      isiSesudah,
      jejak,
      adaBeforeReplace,
      nUndo,
      isiBuffer,
      dirty,
      isiDiskSetelahUndo,
    });
  `,
    240000,
  );

  check(
    'V4',
    v4.hitSebelum === 2 &&
      v4.nGanti === 2 &&
      v4.isiSesudah.includes('OMEGA') &&
      !v4.isiSesudah.includes('alpha') &&
      v4.adaBeforeReplace >= 1 &&
      v4.jejak.length > 0 &&
      v4.jejak.every((h) => h.jumlah === 0 || h.adaSnapshot) &&
      v4.nUndo === 1 &&
      v4.isiBuffer === v4.isiSebelum &&
      v4.dirty === true &&
      v4.isiDiskSetelahUndo === v4.isiSesudah,
    `replace "alpha"→"OMEGA": ${v4.hitSebelum} match → ${v4.nGanti} ganti, ` +
      `isi ${J(v4.isiSesudah.slice(0, 40))}; snapshot before-replace=${v4.adaBeforeReplace}, ` +
      `jejak=${J(v4.jejak)}; undo → ${v4.nUndo} file, buffer kembali ke isi awal ` +
      `(${v4.isiBuffer === v4.isiSebelum}), tab dirty=${v4.dirty}, ` +
      `disk sengaja BELUM berubah (${v4.isiDiskSetelahUndo === v4.isiSesudah})`,
  );

  // ═════════ V5: batas root + kolom UTF-8 (leg SSH fase 07 DITUNDA) ══════════
  //
  // Brief V5 minta "search di sesi SSH menampilkan hasil remote". Fase 07 SSH
  // DITUNDA atas keputusan user (AGENTS.md §2), jadi tidak ada host untuk diuji
  // dan mengarang hasilnya dilarang. Yang bisa diuji sekarang adalah dua
  // prasyarat yang dipakai leg remote nanti:
  //   a. `root` divalidasi — remote search mengirim root dari sisi lain, jadi
  //      penolakan path di luar workspace harus sudah benar sekarang;
  //   b. kolom dikonversi byte→karakter — hasil rg remote juga byte-offset.
  const v5 = await cdp.json(
    `
    // ── a. root di luar workspace ditolak ──
    SR.bersihkan();
    SR.setFlag({ regex: false, caseSensitive: false, respectGitignore: false });
    SR.setQuery('alpha');
    SR.setRoot('C:/Windows');
    let errLuar = null;
    let hitsLuar = -1;
    // Root di luar workspace → command MELEMPAR (ZephyrError), tidak
    // mengembalikan summary dengan pesan. jalankan() menangkapnya ke
    // state.error, tapi bentuknya objek { code, message } sehingga
    // String(e) jadi "[object Object]" — ambil .message-nya.
    const sumLuar = await SR.jalankan();
    await wait(400);
    const mentah = SR.error();
    errLuar =
      mentah && typeof mentah === 'object'
        ? String(mentah.message || JSON.stringify(mentah))
        : String(mentah || '');
    hitsLuar = sumLuar ? sumLuar.hits : 0;

    // ── b. kolom karakter, bukan byte ──
    SR.bersihkan();
    SR.setRoot(${J(F.dir)});
    SR.setQuery('TARGETUTF8');
    SR.setFlag({ caseSensitive: true });
    const sumUtf8 = await SR.jalankan();
    await wait(500);
    const hitUtf8 = SR.grup()
      .flatMap((g) => g.baris.map(() => null))
      .length;
    const h = SR.hit(0);

    // Klik → kursor harus mendarat tepat di 'T', bukan bergeser 4 byte emoji.
    const barisDom = q('[data-testid="sr-hit"]');
    if (barisDom) barisDom.click();
    await wait(1100);
    const cm = CM();
    const pos = cm ? cm.state.selection.main.head : null;
    const line = cm ? cm.state.doc.lineAt(pos) : null;
    const kolKursor = line ? pos - line.from + 1 : null;
    const teksDiKursor = cm && line ? line.text.slice(kolKursor - 1, kolKursor - 1 + 10) : null;

    SR.setRoot('');
    return JSON.stringify({
      errLuar,
      hitsLuar,
      hit0: h,
      kolKursor,
      teksDiKursor,
      utf8Files: sumUtf8 ? sumUtf8.files : 0,
    });
  `,
    240000,
  );

  // '🙂🙂 TARGETUTF8' → 2 emoji (2 unit UTF-16 masing-masing) + spasi = kolom 6.
  // Dalam byte: 4+4+1 = 9, jadi byte-offset mentah akan memberi kolom 10.
  check(
    'V5',
    typeof v5.errLuar === 'string' &&
      v5.errLuar.length > 0 &&
      v5.hitsLuar === 0 &&
      !!v5.hit0 &&
      v5.hit0.col === 6 &&
      v5.kolKursor === 6 &&
      v5.teksDiKursor === 'TARGETUTF8',
    `root di luar workspace ditolak: err=${J(v5.errLuar)} (hits ${v5.hitsLuar}); ` +
      `kolom UTF-8: rg byte-offset 9 → kolom karakter ${v5.hit0 ? v5.hit0.col : '?'} (harus 6), ` +
      `klik → kursor kolom ${v5.kolKursor}, teks di kursor ${J(v5.teksDiKursor)}. ` +
      `CATATAN: leg SSH remote (brief V5) tidak diuji karena fase 07 ditunda user.`,
  );

  // ═════════ V6: virtualisasi — 900 hasil, node DOM tetap sedikit ════════════
  const v6 = await cdp.json(
    `
    SR.bersihkan();
    SR.setRoot(${J(F.dir)});
    SR.setFlag({ regex: false, caseSensitive: true, respectGitignore: true });
    SR.setQuery('PENANDAUJI25');
    const sum = await SR.jalankan();
    await wait(900);

    const total = SR.total();
    const domAwal = SR.domHit();
    const spacerAwal = SR.tinggiSpacer();

    // Gulir jauh ke bawah: baris yang dirender harus BERGANTI, bukan bertambah.
    const y = await SR.gulir(6000);
    await wait(500);
    const domSetelahGulir = SR.domHit();
    const barisTerlihat = qa('[data-testid="sr-hit"]').map((el) =>
      Number(el.getAttribute('data-sr-line')),
    );
    const minBaris = Math.min(...barisTerlihat);
    const maxBaris = Math.max(...barisTerlihat);

    // Gulir kembali ke atas DULU: header file berada di baris pertama daftar,
    // dan setelah gulir 6000px ia tidak ada di DOM sama sekali (virtualisasi),
    // jadi klik lipat akan mengenai null.
    await SR.gulir(0);
    await wait(400);

    // Dua uji dalam satu kelompok, dijalankan lewat DOM klik supaya jalur
    // toggle lipat yang benar-benar dipakai user yang teruji.
    const head = q('[data-testid="sr-file"] .sr-fold');
    if (head) head.click();
    await wait(500);
    const domSetelahLipat = SR.domHit();
    const head2 = q('[data-testid="sr-file"] .sr-fold');
    if (head2) head2.click();
    await wait(400);

    await SR.gulir(0);
    return JSON.stringify({
      total,
      hits: sum ? sum.hits : 0,
      domAwal,
      spacerAwal,
      scrollTop: y,
      domSetelahGulir,
      minBaris,
      maxBaris,
      domSetelahLipat,
    });
  `,
    240000,
  );

  check(
    'V6',
    v6.total === 900 &&
      v6.domAwal > 0 &&
      v6.domAwal < 100 &&
      v6.domSetelahGulir < 100 &&
      v6.minBaris > 100 &&
      v6.spacerAwal > 900 * 20 &&
      v6.domSetelahLipat === 0,
    `${v6.total} hasil: DOM merender ${v6.domAwal} baris (bukan 900), ` +
      `spacer ${v6.spacerAwal}px; setelah gulir ke ${v6.scrollTop}px → ` +
      `${v6.domSetelahGulir} baris, jendela baris ${v6.minBaris}..${v6.maxBaris}; ` +
      `lipat file → ${v6.domSetelahLipat} baris`,
  );

  // ═════════ V7: max results + cancel + riwayat query ═══════════════════════
  const v7 = await cdp.json(
    `
    // ── max results: rg dibunuh setelah batas, hasil ditandai truncated ──
    SR.bersihkan();
    SR.setRoot(${J(F.dir)});
    SR.setFlag({ caseSensitive: true, regex: false, respectGitignore: true });
    SR.setMaxResults(25);
    SR.setQuery('PENANDAUJI25');
    const sumBatas = await SR.jalankan();
    await wait(700);
    const totalBatas = SR.total();
    SR.setMaxResults(5000);

    // ── cancel: pencarian besar dibatalkan di tengah jalan ──
    //
    // Query dipicu lewat DEBOUNCE panel (setQuery lalu tunggu), bukan
    // SR.jalankan() manual. Kalau keduanya dipakai, ada DUA pencarian: satu
    // dari panggilan manual dan satu dari effect debounce 350ms — yang kedua
    // membuat running kembali true setelah cancel dan ujinya gagal padahal
    // pembatalannya benar.
    SR.bersihkan();
    SR.setRoot('');
    SR.setFlag({ respectGitignore: false, includeHidden: true });
    SR.setQuery('e');
    await wait(560);
    const runningSaatJalan = SR.running();
    await SR.batalkan();
    await wait(700);
    const runningSetelah = SR.running();
    const sumBatal = SR.summary();
    SR.setFlag({ respectGitignore: true, includeHidden: false });
    SR.setRoot(${J(F.dir)});

    // ── riwayat query ──
    SR.bersihkan();
    SR.setQuery('alpha');
    await SR.jalankan();
    await wait(400);
    SR.setQuery('PENANDAUJI25');
    await SR.jalankan();
    await wait(400);
    const riwayat = SR.riwayat();
    const opsiDatalist = qa('#zephyr-search-riwayat option').map((o) => o.value);

    // Panel replace terbuka lewat SHORTCUT ASLI (Ctrl+Shift+H), bukan
    // runCommand: aksi edit.replaceInFiles ditangani switch keydown di App.tsx,
    // bukan lewat commandRegistry — jadi __ZEPHYR_NOTIF__.run tidak mengenainya.
    // (Tanpa backtick di komentar: ini DI DALAM template literal.)
    const sebelumH = SR.state().replaceTerbuka;
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'H',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(600);
    const sesudahH = SR.state().replaceTerbuka;
    const inputReplaceAda = !!q('[data-testid="search-replace-input"]');

    return JSON.stringify({
      batasHits: sumBatas ? sumBatas.hits : 0,
      batasTruncated: sumBatas ? sumBatas.truncated : null,
      totalBatas,
      runningSaatJalan,
      runningSetelah,
      batalTruncated: sumBatal ? sumBatal.truncated : null,
      riwayat,
      opsiDatalist,
      sebelumH,
      sesudahH,
      inputReplaceAda,
    });
  `,
    240000,
  );

  check(
    'V7',
    v7.batasHits <= 30 &&
      v7.batasTruncated === true &&
      v7.runningSaatJalan === true &&
      v7.runningSetelah === false &&
      v7.riwayat[0] === 'PENANDAUJI25' &&
      v7.riwayat.includes('alpha') &&
      v7.opsiDatalist.includes('PENANDAUJI25') &&
      v7.sebelumH === false &&
      v7.sesudahH === true &&
      v7.inputReplaceAda,
    `maxResults 25 → ${v7.batasHits} match truncated=${v7.batasTruncated} ` +
      `(dari 900 yang tersedia); cancel: running ${v7.runningSaatJalan}→${v7.runningSetelah}, ` +
      `truncated=${v7.batalTruncated}; riwayat=${J(v7.riwayat.slice(0, 3))} ` +
      `datalist=${v7.opsiDatalist.length} opsi; Ctrl+Shift+H → replace ` +
      `${v7.sebelumH}→${v7.sesudahH}, input ada=${v7.inputReplaceAda}`,
  );
};
