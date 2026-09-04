// v29/bagian2.mjs — V4 & V5 fase 29.
//
// PERINGATAN: jangan pakai backtick di komentar yang ada DI DALAM template
// literal (kena 4 kali di fase 22/25/26).

const J = JSON.stringify;
const norm = (s) => String(s || '').replace(/\\/g, '/').toLowerCase();

export const bagian2 = async (cdp, check, F, { fs }) => {
  // ═══════ V4: urutan scope Default < User < Workspace < Folder ═══════
  //
  // Satu kunci diuji sampai keempat lapisan: editor.tabSize.
  // Angka dipilih supaya tidak mungkin ambigu — 8 (workspace) dan 3 (folder
  // root-b) tidak muncul di default maupun user.
  const v4 = await cdp.json(`
    await WS.bukaFile(${J(F.wsFile)});
    await wait(1600);

    // (a) USER saja: root-a tidak punya .zephyr/settings.json, tapi
    // .code-workspace memasang tabSize 8 → workspace menang atas user.
    const efA = await WS.settingsEfektif(${J(F.rootA)});
    const asalA = await WS.asalNilai('editor.tabSize', ${J(F.rootA)});

    // (b) FOLDER menang atas workspace: root-b punya .zephyr/settings.json
    // dengan tabSize 3.
    const efB = await WS.settingsEfektif(${J(F.rootB)});
    const asalB = await WS.asalNilai('editor.tabSize', ${J(F.rootB)});

    // (c) Kunci yang tidak disebut siapa pun tetap dari DEFAULT.
    const asalDefault = await WS.asalNilai('editor.wordWrap', ${J(F.rootB)});

    // (d) Tulis lewat scope workspace: harus mengubah nilai efektif root-a
    // (yang tidak punya settings folder) tanpa menyentuh root-b.
    const tulisOk = await WS.setSettingsWorkspace({ editor: { tabSize: 6 } });
    await wait(900);
    const efA2 = await WS.settingsEfektif(${J(F.rootA)});
    const efB2 = await WS.settingsEfektif(${J(F.rootB)});

    return JSON.stringify({
      tabA: efA.editor ? efA.editor.tabSize : null,
      asalA,
      tabB: efB.editor ? efB.editor.tabSize : null,
      asalB,
      asalDefault,
      tulisOk,
      tabA2: efA2.editor ? efA2.editor.tabSize : null,
      tabB2: efB2.editor ? efB2.editor.tabSize : null,
    })
  `);

  const v4ok =
    // Workspace (8) menimpa user/default untuk root tanpa settings folder.
    v4.tabA === 8 &&
    v4.asalA === 'workspace' &&
    // Folder (3) menimpa workspace.
    v4.tabB === 3 &&
    v4.asalB === 'folder' &&
    // Kunci tak disebut = default.
    v4.asalDefault === 'default' &&
    // Tulis ke scope workspace mengubah root-a saja.
    v4.tulisOk === true &&
    v4.tabA2 === 6 &&
    v4.tabB2 === 3;

  check(
    'F29-V4',
    v4ok,
    `root-a tabSize=${v4.tabA} (asal ${v4.asalA}); root-b tabSize=${v4.tabB} (asal ${v4.asalB}); ` +
      `wordWrap asal ${v4.asalDefault}; set workspace 6 -> a=${v4.tabA2} b=${v4.tabB2} ` +
      `(folder tetap menang)`,
  );

  // ═══════════════ V5: Restricted Mode benar-benar memblokir ═══════════════
  //
  // Yang diuji BUKAN tombol yang disembunyikan, tapi command RUST yang menolak.
  // Itu bedanya keamanan dan kosmetik: command bisa dipanggil dari palette,
  // keybinding, MCP, atau bridge dev.
  const v5a = await cdp.json(`
    // ── Prasyarat V5 dibuat EKSPLISIT, tidak diasumsikan ──
    //
    // Trust MEWARISI KE BAWAH (itu memang rancangannya), dan fixture uji hidup
    // di D:/Zephyr/.zephyr/uji29/root-a. Jadi kalau D:/Zephyr pernah dipercaya
    // — dan itu wajar, harness fase 23/22 butuh itu — root-a otomatis ikut
    // tepercaya dan uji "belum dipercaya" jadi bohong. Dua-duanya dilupakan
    // dulu supaya keadaan awal benar-benar Unknown.
    await WS.lupakanTrust('D:/Zephyr');
    await WS.lupakanTrust(${J(F.rootA)});
    await WS.lupakanTrust(${J(F.rootB)});
    await wait(300);

    await S.getState().openWorkspace(${J(F.rootA)});
    await wait(1300);
    await WS.muat();
    await wait(400);

    const trustAwal = WS.roots().map((r) => r.trust);
    const perluTanya = WS.perluTanya();
    const bolehAwal = await WS.bolehEksekusi();
    const bannerAwal = WS.domBanner();
    const dialogAwal = WS.domDialog();

    // Coba jalankan tiap fitur eksekusi lewat jalur produk. Semua harus DITOLAK.
    const coba = async (fn) => {
      try { await fn(); return 'LOLOS'; }
      catch (e) { return String((e && e.message) || e); }
    };

    const rTask = await coba(() => WS.mentahTask('uji29-' + Date.now()));
    const rDebug = await coba(() => WS.mentahDebug());
    const rLsp = await coba(() => WS.mentahLsp(${J(F.rootA)}));
    const rExt = await coba(() => WS.mentahExt('zephyr.contoh'));

    return JSON.stringify({
      trustAwal, perluTanya, bolehAwal, bannerAwal, dialogAwal,
      rTask, rDebug, rLsp, rExt,
    })
  `);

  // Trust -> semuanya aktif lagi + keputusan persist di trust.json.
  const v5b = await cdp.json(`
    WS.tanya(${J(F.rootA)});
    await wait(400);
    const dialogTampil = WS.domDialog();
    const klik = WS.klikTrustYes();
    await wait(1400);

    const trustSetelah = WS.roots().map((r) => r.trust);
    const bolehSetelah = await WS.bolehEksekusi();
    const bannerSetelah = WS.domBanner();

    // Sekarang task yang sama harus BISA jalan (dan langsung dimatikan).
    let taskSetelah = 'GAGAL';
    let idRun = '';
    try {
      idRun = 'uji29ok-' + Date.now();
      await WS.mentahTask(idRun);
      taskSetelah = 'JALAN';
    } catch (e) {
      taskSetelah = String((e && e.message) || e);
    }
    // Proses uji dimatikan lewat command Rust (tasks_kill): membiarkannya
    // hidup membuat regresi fase 23 melihat run yang tidak dikenal.
    try { if (idRun) await WS.matikanTask(idRun); } catch (e) { void e; }

    await WS.muatDaftarTrust();
    const daftar = WS.daftarTrust();

    // D:/Zephyr dipercaya lagi: harness fase 22/23/25 menjalankan tasks/debug
    // di sana, dan meninggalkannya Unknown akan membuat regresi gagal.
    await WS.setTrust('D:/Zephyr', true);
    await wait(400);

    return JSON.stringify({
      dialogTampil, klik, trustSetelah, bolehSetelah, bannerSetelah, taskSetelah,
      daftar,
    })
  `);

  const diblokir = (s) => typeof s === 'string' && s !== 'LOLOS' && /diblokir|belum dipercaya|Restricted/i.test(s);
  const trustDisk = bacaTrustJson(fs, F.trustJson);

  const v5ok =
    // Keadaan awal: belum ditanya, eksekusi tidak boleh, banner tampil.
    v5a.trustAwal.join() === 'unknown' &&
    v5a.perluTanya === true &&
    v5a.bolehAwal === false &&
    typeof v5a.bannerAwal === 'string' &&
    v5a.bannerAwal.length > 0 &&
    // Dialog muncul sendiri dan TIDAK punya tombol tutup saat masih unknown.
    !!v5a.dialogAwal &&
    v5a.dialogAwal.adaYes &&
    v5a.dialogAwal.adaNo &&
    v5a.dialogAwal.adaTutup === false &&
    // Empat jalur eksekusi ditolak RUST, bukan disembunyikan UI.
    diblokir(v5a.rTask) &&
    diblokir(v5a.rDebug) &&
    diblokir(v5a.rLsp) &&
    diblokir(v5a.rExt) &&
    // Setelah Trust: aktif, banner hilang, task jalan.
    v5b.klik === true &&
    v5b.trustSetelah.join() === 'trusted' &&
    v5b.bolehSetelah === true &&
    v5b.bannerSetelah === null &&
    v5b.taskSetelah === 'JALAN' &&
    // Persist: trust.json di disk memuat keputusan itu.
    !!trustDisk &&
    Object.entries(trustDisk).some(
      ([k, v]) => norm(k) === norm(F.rootA) && v === 'trusted',
    ) &&
    v5b.daftar.some((d) => norm(d.path) === norm(F.rootA) && d.trust === 'trusted');

  check(
    'F29-V5',
    v5ok,
    `awal trust=${J(v5a.trustAwal)} boleh=${v5a.bolehAwal} banner="${String(v5a.bannerAwal).slice(0, 40)}" ` +
      `dialog(yes=${v5a.dialogAwal?.adaYes} no=${v5a.dialogAwal?.adaNo} tutup=${v5a.dialogAwal?.adaTutup}); ` +
      `blokir task=${ringkas(v5a.rTask)} debug=${ringkas(v5a.rDebug)} lsp=${ringkas(v5a.rLsp)} ext=${ringkas(v5a.rExt)}; ` +
      `setelah Trust: ${J(v5b.trustSetelah)} boleh=${v5b.bolehSetelah} banner=${v5b.bannerSetelah} ` +
      `task=${v5b.taskSetelah}; trust.json=${trustDisk ? 'ada' : 'TIDAK ADA'}`,
  );

  // Bersihkan: harness fase 02/03/04 memeriksa empty-state editor, dan
  // Settings yang tertinggal terbuka membuat verify04 V2 gagal (fase 08/28).
  await cdp.json(`
    S.getState().setSettingsOpen(false);
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(900);
    await WS.muat();
    return JSON.stringify({ ok: true })
  `);
};

const ringkas = (s) => (s === 'LOLOS' ? 'LOLOS' : 'ditolak');

function bacaTrustJson(fs, p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
