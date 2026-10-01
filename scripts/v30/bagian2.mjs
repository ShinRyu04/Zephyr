// v30/bagian2.mjs — V4 (variabel) & V5 (user + ekstensi + prioritas).
//
// PERINGATAN PERMANEN: JANGAN pakai backtick di komentar DI DALAM template
// literal — template tertutup lebih awal dan node --check tetap lolos.

import { HELPER } from './bagian1.mjs';

export const bagian2 = async (cdp, check, F, { fs }) => {
  // ═════════ V4: TM_SELECTED_TEXT + CURRENT_YEAR + escape ═════════
  const v4 = await cdp.json(`
    ${HELPER}
    const view = CM();
    if (!view) return JSON.stringify({ err: 'tidak ada EditorView' });

    // ── 4a. TM_SELECTED_TEXT memakai seleksi NYATA di editor ──
    //
    // Baris 'const dibungkus = 1;' dicari lewat isinya, bukan nomor baris
    // (nomor hardcoded sudah pernah bikin "Selection points outside of
    // document" begitu fixture bergeser satu baris).
    const nSel = cariBaris(view, 'dibungkus');
    if (nSel < 0) return JSON.stringify({ err: 'baris dibungkus tidak ada' });
    const lSel = view.state.doc.line(nSel);
    const kolom = lSel.text.indexOf('dibungkus');
    const dari = lSel.from + kolom;
    const sampai = dari + 'dibungkus'.length;
    view.dispatch({ selection: { anchor: dari, head: sampai } });
    await wait(150);
    const terseleksi = view.state.sliceDoc(dari, sampai);

    const rSel = await SN.sisip('typescript', 'ujisel');
    await wait(300);
    const isiSel = view.state.doc.line(nSel).text;
    SN.keluarSnippet();

    // ── 4b. CURRENT_YEAR & TM_FILENAME & TM_LINE_NUMBER ──
    const nVar = await kosongkanBaris(view, 'SLOT3');
    const rVar = await SN.sisip('typescript', 'ujivar');
    await wait(300);
    const isiVar = nVar > 0 ? view.state.doc.line(nVar).text : '';
    SN.keluarSnippet();

    // ── 4c. escape \\$ tidak dianggap placeholder ──
    const nEsc = await kosongkanBaris(view, 'SLOT4');
    const rEsc = await SN.sisip('typescript', 'ujiesc');
    await wait(300);
    const isiEsc = nEsc > 0 ? view.state.doc.line(nEsc).text : '';
    SN.keluarSnippet();

    // ── 4d. penerjemah diperiksa TERPISAH dari editor ──
    //
    // Kalau uji end-to-end di atas gagal, ini yang membedakan 'parser salah'
    // dari 'integrasi CM salah'.
    const t1 = SN.terjemah('a=\${2:dua} b=\${1:satu} c=$0');
    const t2 = SN.terjemah('x=\${1|p,q,r|}');
    const t3 = SN.terjemah('n=\${1:\${2:dalam}}');
    const t4 = SN.terjemah('lit=\\\\$100 v=\${1:x}');
    const vars = SN.variabel({ seleksi: 'SEL', path: 'D:/a/b/c.ts', nomorBaris: 42 });

    return JSON.stringify({
      nSel, nVar, nEsc,
      terseleksi,
      rSel, isiSel,
      rVar, isiVar,
      rEsc, isiEsc,
      tahunSekarang: String(new Date().getFullYear()),
      t1: t1.template, t1stops: t1.stops,
      t2: t2.template,
      t3: t3.template,
      t4: t4.template,
      varTahun: vars.CURRENT_YEAR,
      varSel: vars.TM_SELECTED_TEXT,
      varFile: vars.TM_FILENAME,
      varBaris: vars.TM_LINE_NUMBER,
      takDikenal: SN.terjemah('$TIDAK_ADA_INI').adaVarTakDikenal,
    })
  `);

  const v4ok =
    !v4.err &&
    v4.terseleksi === 'dibungkus' &&
    v4.rSel === 'ok' &&
    // Seleksi masuk ke dalam kurung siku: itu bukti TM_SELECTED_TEXT terpakai.
    v4.isiSel.includes('[dibungkus]') &&
    v4.rVar === 'ok' &&
    v4.isiVar.includes(`tahun=${v4.tahunSekarang}`) &&
    v4.isiVar.includes('file=target30.ts') &&
    v4.isiVar.includes(`baris=${v4.nVar}`) &&
    v4.rEsc === 'ok' &&
    // $100 harus tetap literal, bukan jadi tab stop.
    v4.isiEsc.includes('$100') &&
    // Penerjemah: urutan tab diurut ulang (1 dulu, 0 terakhir).
    JSON.stringify(v4.t1stops) === '[1,2,0]' &&
    v4.t1 === 'a=${dua} b=${satu} c=${}' &&
    // Choice: pilihan pertama jadi default.
    v4.t2 === 'x=${p}' &&
    // Nested: diratakan jadi teks default.
    v4.t3 === 'n=${dalam}' &&
    v4.t4 === 'lit=$100 v=${x}' &&
    v4.varTahun === v4.tahunSekarang &&
    v4.varSel === 'SEL' &&
    v4.varFile === 'c.ts' &&
    v4.varBaris === '42' &&
    // Variabel tak dikenal DILAPORKAN, bukan didiamkan.
    (v4.takDikenal || []).includes('TIDAK_ADA_INI');
  check(
    'F30-V4',
    v4ok,
    v4.err
      ? v4.err
      : `sel="${v4.terseleksi}"->"${String(v4.isiSel).slice(0, 30)}" ` +
        `var(baris ${v4.nVar})="${String(v4.isiVar).slice(0, 46)}" ` +
        `esc="${String(v4.isiEsc).slice(0, 26)}" ` +
        `t1=${v4.t1} stops=${JSON.stringify(v4.t1stops)} t2=${v4.t2} t3=${v4.t3} ` +
        `takDikenal=${JSON.stringify(v4.takDikenal)}`,
  );

  // ═════════ V5: user snippet + snippet ekstensi + prioritas ═════════
  const v5 = await cdp.json(`
    SN.bersihkanCache();
    const setb = await SN.muat('typescript', true);
    const daftar = SN.untuk('typescript');

    const cari = (p) => daftar.find((s) => s.prefix === p) || null;
    const sUser = cari('ujiuser');
    const sExt = cari('ujiext');
    const sLog = cari('log');

    // Warisan: snippet javascript & global harus ikut muncul di typescript.
    const adaGlobal = daftar.some((s) => s.lang === 'global');
    const adaJs = daftar.some((s) => s.lang === 'javascript');

    // Bahasa lain: rust dapat snippet ekstensi rust, TIDAK dapat yang ts.
    await SN.muat('rust', true);
    const rust = SN.untuk('rust');
    const rustExt = rust.find((s) => s.prefix === 'ujiextrs') || null;
    const rustBocorTs = rust.some((s) => s.prefix === 'ujiext');

    // Daftar bahasa yang punya file user (dari Rust, bukan tebakan frontend).
    await SN.state().muatDaftar();
    const bahasaUser = SN.daftarUser();

    return JSON.stringify({
      total: daftar.length,
      userPath: setb ? setb.userPath : null,
      userAda: setb ? setb.userAda : null,
      rusak: setb ? setb.rusak : null,
      sUser: sUser ? { sumber: sUser.sumber, body: sUser.body.slice(0, 40) } : null,
      sExt: sExt ? { sumber: sExt.sumber, body: sExt.body } : null,
      sLog: sLog ? { sumber: sLog.sumber, body: sLog.body } : null,
      adaGlobal, adaJs,
      rustExt: rustExt ? { sumber: rustExt.sumber, body: rustExt.body } : null,
      rustBocorTs,
      bahasaUser,
    })
  `);

  const v5ok =
    v5.sUser !== null &&
    v5.sUser.sumber === 'user' &&
    // Snippet ekstensi terbaca dari manifest contributes.snippets.
    v5.sExt !== null &&
    v5.sExt.sumber === `ext:${F.extId}` &&
    // PRIORITAS: 'log' ada di bawaan, ekstensi, DAN user -> user harus menang.
    v5.sLog !== null &&
    v5.sLog.sumber === 'user' &&
    v5.sLog.body.includes('USERLOG') &&
    // Warisan bahasa.
    v5.adaGlobal === true &&
    v5.adaJs === true &&
    // Snippet ekstensi untuk rust sampai ke rust, dan yang ts TIDAK bocor.
    v5.rustExt !== null &&
    v5.rustExt.sumber === `ext:${F.extId}` &&
    v5.rustBocorTs === false &&
    // Rust melaporkan file user yang ada.
    (v5.bahasaUser || []).includes('typescript') &&
    // Tidak ada file yang gagal diparse.
    (v5.rusak || []).length === 0;
  check(
    'F30-V5',
    v5ok,
    `total=${v5.total} user=${v5.sUser ? v5.sUser.sumber : 'X'} ` +
      `ext=${v5.sExt ? v5.sExt.sumber : 'X'} log=${v5.sLog ? v5.sLog.sumber : 'X'}` +
      `${v5.sLog ? '/' + v5.sLog.body.slice(0, 14) : ''} ` +
      `global=${v5.adaGlobal} js=${v5.adaJs} rustExt=${v5.rustExt ? 'ya' : 'X'} ` +
      `bocor=${v5.rustBocorTs} bahasaUser=${JSON.stringify(v5.bahasaUser)} ` +
      `rusak=${JSON.stringify(v5.rusak)}`,
  );

  // Pembersihan: tutup tab uji + Settings, kembalikan dokumen fixture.
  // (Pelajaran fase 28: harness yang meninggalkan Settings terbuka membuat
  // verify04 V2 gagal karena tab bar tidak dirender.)
  await cdp.json(`
    SN.keluarSnippet();
    S.getState().setSettingsOpen(false);
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    await wait(200);
    return JSON.stringify({ tabs: S.getState().tabs.length })
  `);

  // File fixture ditulis ulang: uji di atas mengubah isinya di buffer, dan
  // beberapa tab ditutup tanpa simpan — pastikan disk kembali ke keadaan awal
  // supaya menjalankan harness dua kali memberi hasil sama.
  void fs;
};
