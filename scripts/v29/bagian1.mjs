// v29/bagian1.mjs — V2 & V3 fase 29.
//
// PERINGATAN: jangan pakai backtick di komentar yang ada DI DALAM template
// literal (kena 4 kali di fase 22/25/26).

const J = JSON.stringify;
const norm = (s) => String(s || '').replace(/\\/g, '/').toLowerCase();

export const bagian1 = async (cdp, check, F) => {
  // ═════════ V2: dua root tampil di explorer, tree & git per root ═════════
  const v2 = await cdp.json(`
    // Dialog Trust bisa muncul sendiri (trust.json dikosongkan verify29) dan
    // overlay-nya menutupi Explorer. Ditutup dulu: V2/V3 menguji multi-root,
    // bukan trust — trust diuji V5.
    WS.tanya(null);
    await wait(200);

    // Mulai bersih: satu root biasa dulu, lalu tambah root kedua.
    S.getState().setSettingsOpen(false);
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    await S.getState().openWorkspace(${J(F.rootA)});
    await wait(1200);
    await WS.muat();
    WS.tanya(null);
    await wait(300);

    // Sidebar Explorer harus terlihat: panel terminal yang di-maximize membuat
    // .editor-area display:none dan sidebar 0x0 (pelajaran fase 13).
    if (TS().maximized || TS().visible) TS().setVisible(false);
    S.setState({ sidebarVisible: true });
    S.getState().setActivity('explorer');
    await wait(400);

    const rootTunggal = WS.roots().length;
    const domTunggal = WS.domRoots();

    // Tambah root kedua.
    const ok = await WS.tambahRoot(${J(F.rootB)});
    await wait(1500);

    const roots = WS.roots();
    const domPaths = WS.domRootPaths();
    const trees = WS.domTrees();

    return JSON.stringify({
      rootTunggal,
      domTunggal,
      tambahOk: ok,
      jumlahRoot: roots.length,
      paths: roots.map((r) => r.path),
      nama: roots.map((r) => r.name),
      isRepo: roots.map((r) => r.isRepo),
      aktif: WS.activeRoot(),
      domRoots: WS.domRoots(),
      domPaths,
      trees,
    })
  `);

  const treeA = v2.trees.find((t) => norm(t.root) === norm(F.rootA));
  const treeB = v2.trees.find((t) => norm(t.root) === norm(F.rootB));

  const v2ok =
    // Root tunggal TIDAK memakai header section (keputusan desain fase 29).
    v2.rootTunggal === 1 &&
    v2.domTunggal === 0 &&
    v2.tambahOk === true &&
    v2.jumlahRoot === 2 &&
    norm(v2.paths[0]) === norm(F.rootA) &&
    norm(v2.paths[1]) === norm(F.rootB) &&
    // root-a punya .git, root-b tidak → deteksi repo PER ROOT.
    v2.isRepo[0] === true &&
    v2.isRepo[1] === false &&
    // Dua header + dua tree terpisah benar-benar dirender.
    v2.domRoots === 2 &&
    v2.domPaths.length === 2 &&
    !!treeA &&
    !!treeB &&
    // Isi tree beda: root-a 3 entri atas, root-b 4 entri atas.
    treeA.baris === 3 &&
    treeB.baris === 4;

  check(
    'F29-V2',
    v2ok,
    `1 root -> ${v2.domTunggal} header (tanpa section); tambah root -> ${v2.jumlahRoot} root ` +
      `${J(v2.nama)}, isRepo ${J(v2.isRepo)}, DOM ${v2.domRoots} header; ` +
      `tree a=${treeA ? treeA.baris : '-'} b=${treeB ? treeB.baris : '-'} baris`,
  );

  // ═══════════ V3: .code-workspace load + save + restore ═══════════
  const v3 = await cdp.json(`
    // Buka file .code-workspace: path RELATIF + komentar JSONC + settings.
    const ok = await WS.bukaFile(${J(F.wsFile)});
    await wait(1800);

    const roots = WS.roots();
    const namaDariFile = roots.map((r) => r.name);
    const fileTerpasang = WS.file();
    // Atribut dibaca JADI STRING sekarang, bukan menyimpan referensi elemen:
    // getAttribute yang dievaluasi di blok return akhir akan membaca keadaan
    // SETELAH wsHilang dibuka (1 root), bukan keadaan saat ini (2 root).
    const exNow = q('.explorer');
    const domRootsSaatLoad = exNow ? exNow.getAttribute('data-roots') : null;
    const domWsFileSaatLoad = exNow ? exNow.getAttribute('data-ws-file') : null;

    // Simpan ke file BARU, lalu buka file itu dan bandingkan.
    const disimpan = await WS.simpanFile(${J(F.wsSimpan)});
    await wait(900);

    // Pindah ke workspace lain dulu supaya "restore" benar-benar memuat ulang.
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(1000);
    await WS.muat();
    const rootSetelahPindah = WS.roots().length;

    const ok2 = await WS.bukaFile(${J(F.wsSimpan)});
    await wait(1800);
    const rootsRestore = WS.roots();

    // Folder yang hilang harus DILEWATI, bukan membatalkan seluruh workspace.
    const ok3 = await WS.bukaFile(${J(F.wsHilang)});
    await wait(1500);
    const rootsHilang = WS.roots();

    return JSON.stringify({
      ok,
      namaDariFile,
      fileTerpasang,
      domRoots: domRootsSaatLoad,
      domWsFile: domWsFileSaatLoad,
      disimpan,
      rootSetelahPindah,
      ok2,
      restorePaths: rootsRestore.map((r) => r.path),
      restoreNama: rootsRestore.map((r) => r.name),
      ok3,
      hilangPaths: rootsHilang.map((r) => r.path),
    })
  `);

  const isiSimpan = await bacaJson(cdp, F.wsSimpan);

  const v3ok =
    v3.ok === true &&
    // Nama dari .code-workspace dipakai, bukan basename folder.
    v3.namaDariFile.join() === 'Root A,Root B' &&
    norm(v3.fileTerpasang) === norm(F.wsFile) &&
    v3.domRoots === '2' &&
    v3.disimpan === true &&
    // File hasil simpan memuat path RELATIF, bukan absolut mesin ini.
    // File ini disimpan DI DALAM root-a, jadi root-a jadi "." dan root-b jadi
    // "../root-b" — dua-duanya relatif, itu yang penting.
    !!isiSimpan &&
    isiSimpan.folders.length === 2 &&
    isiSimpan.folders.every((f) => !/^[a-zA-Z]:/.test(f.path)) &&
    isiSimpan.folders[0].path === '.' &&
    isiSimpan.folders[1].path === '../root-b' &&
    // settings workspace ikut tersimpan.
    isiSimpan.settings &&
    isiSimpan.settings.editor &&
    isiSimpan.settings.editor.tabSize === 8 &&
    // Restore: dua root kembali dengan nama yang sama.
    v3.rootSetelahPindah === 1 &&
    v3.ok2 === true &&
    v3.restorePaths.length === 2 &&
    v3.restoreNama.join() === 'Root A,Root B' &&
    // Folder hilang dilewati: tetap 1 root yang valid.
    v3.ok3 === true &&
    v3.hilangPaths.length === 1 &&
    norm(v3.hilangPaths[0]) === norm(F.rootA);

  check(
    'F29-V3',
    v3ok,
    `load ${J(v3.namaDariFile)} (data-roots=${v3.domRoots}); simpan ${v3.disimpan} -> ` +
      `folders ${isiSimpan ? J(isiSimpan.folders.map((f) => f.path)) : 'GAGAL BACA'} ` +
      `settings.tabSize=${isiSimpan?.settings?.editor?.tabSize}; ` +
      `restore ${v3.rootSetelahPindah}->${v3.restorePaths.length} root ${J(v3.restoreNama)}; ` +
      `folder hilang -> ${v3.hilangPaths.length} root valid`,
  );
};

/** Baca file JSONC dari disk lewat jalur produk (fs_read di Rust). */
async function bacaJson(cdp, path) {
  const r = await cdp.json(`
    try {
      const hasil = await window.__ZEPHYR_FS__.read(${J(path)});
      return JSON.stringify({ ok: true, teks: hasil.content });
    } catch (e) {
      return JSON.stringify({ ok: false, err: String(e && e.message || e) });
    }
  `);
  if (!r.ok) return null;
  try {
    // Buang komentar baris supaya JSON.parse bisa membacanya.
    return JSON.parse(r.teks.replace(/^\s*\/\/.*$/gm, ''));
  } catch {
    return null;
  }
}
