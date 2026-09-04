// v30/bagian1.mjs — V2 (completion + ekspansi) & V3 (tab stop + sinkron).
//
// PERINGATAN PERMANEN: JANGAN pakai backtick di komentar DI DALAM template
// literal — template tertutup lebih awal dan node --check tetap lolos.
// Sudah kena 4 kali (verify26, verify25, fixture22, verify22).

const J = (s) => JSON.stringify(s);

// Helper yang disuntik ke dalam evaluasi CDP: cari nomor baris dari MARKER.
//
// Nomor baris hardcoded pecah begitu fixture berubah sedikit, dan gagalnya
// tidak jelas ("Selection points outside of document"). Marker membuat harness
// tahan terhadap perubahan fixture.
export const HELPER = `
    const cariBaris = (view, penanda) => {
      const total = view.state.doc.lines;
      for (let i = 1; i <= total; i++) {
        if (view.state.doc.line(i).text.includes(penanda)) return i;
      }
      return -1;
    };
    const kosongkanBaris = async (view, penanda) => {
      const n = cariBaris(view, penanda);
      if (n < 0) return -1;
      const l = view.state.doc.line(n);
      view.dispatch({
        changes: { from: l.from, to: l.to, insert: '' },
        selection: { anchor: l.from, head: l.from },
      });
      await wait(120);
      return n;
    };
`;

export const bagian1 = async (cdp, check, F) => {
  // Ekstensi uji30 diaktifkan lewat jalur produk supaya snippet ekstensi ikut
  // terbaca di V5. Dilakukan di awal karena settings perlu tersimpan lebih dulu.
  await cdp.json(`
    const st = S.getState();
    const en = (st.settings.extensions && st.settings.extensions.enabled) || [];
    if (!en.includes(${J(F.extId)})) {
      await st.applySettings({ extensions: { enabled: [...en, ${J(F.extId)}] } });
      await wait(500);
    }
    SN.bersihkanCache();
    return JSON.stringify({ enabled: (S.getState().settings.extensions || {}).enabled })
  `);

  // ═════════ V2: prefix -> snippet di completion -> placeholder aktif ═════════
  const v2 = await cdp.json(`
    ${HELPER}
    await S.getState().openPath(${J(F.ts)});
    await wait(900);
    const view = CM();
    if (!view) return JSON.stringify({ err: 'tidak ada EditorView' });

    // Muat snippet untuk bahasa tab aktif; hasilnya juga dipakai memeriksa
    // bahwa daftar completion memang berisi snippet.
    const tab = S.getState().tabs.find((t) => t.id === S.getState().activeTabId);
    const lang = tab ? tab.lang : 'plain';
    const setb = await SN.muat(lang, true);
    const daftar = SN.untuk(lang);

    const adaLog = daftar.some((s) => s.prefix === 'log');
    const adaUser = daftar.some((s) => s.prefix === 'ujiuser');

    // Sisipkan 'ujiurut' di SLOT1: body-nya menaruh \${2} sebelum \${1},
    // jadi ini sekaligus menguji pengurutan ulang tab stop.
    const nBaris = await kosongkanBaris(view, 'SLOT1');
    const r = await SN.sisip(lang, 'ujiurut');
    await wait(320);

    const isiSlot = nBaris > 0 ? view.state.doc.line(nBaris).text : '';
    const fieldAda = SN.jumlahField();
    const modeAktif = SN.modeAktif();
    SN.keluarSnippet();

    return JSON.stringify({
      lang,
      jumlah: daftar.length,
      sumberAda: [...new Set(daftar.map((s) => s.sumber))],
      adaLog,
      adaUser,
      sisip: r,
      nBaris,
      isiSlot,
      fieldAda,
      modeAktif,
      rusak: setb ? setb.rusak : null,
      userPath: setb ? setb.userPath : null,
    })
  `);

  const v2ok =
    !v2.err &&
    v2.lang === 'typescript' &&
    v2.jumlah > 0 &&
    v2.adaLog === true &&
    v2.adaUser === true &&
    v2.sisip === 'ok' &&
    v2.nBaris > 0 &&
    // ${2:dua} muncul sebelum ${1:satu} di body -> teks defaultnya tetap masuk.
    v2.isiSlot.includes('a=dua') &&
    v2.isiSlot.includes('b=satu') &&
    // Mode tab stop AKTIF setelah accept: itu inti V2.
    v2.modeAktif === true &&
    v2.fieldAda >= 2;
  check(
    'F30-V2',
    v2ok,
    v2.err
      ? v2.err
      : `lang=${v2.lang} snippet=${v2.jumlah} sumber=[${(v2.sumberAda || []).join(',')}] ` +
        `sisip=${v2.sisip} baris${v2.nBaris}="${String(v2.isiSlot).slice(0, 42)}" ` +
        `field=${v2.fieldAda} modeAktif=${v2.modeAktif}`,
  );

  // ═════════ V3: Tab/Shift+Tab pindah stop; occurrence sinkron ═════════
  const v3 = await cdp.json(`
    ${HELPER}
    const view = CM();
    const n = await kosongkanBaris(view, 'SLOT2');
    if (n < 0) return JSON.stringify({ err: 'SLOT2 tidak ada' });

    // 'ujisync' = let \${1:v} = \${2:isi}; pakai(\${1:v}); akhir($0)
    // \${1} muncul DUA KALI -> occurrence harus sinkron; ada TIGA field
    // (1, 2, 0) supaya Tab lalu Shift+Tab masih di dalam sesi snippet.
    const r = await SN.sisip('typescript', 'ujisync');
    await wait(320);

    const setelahSisip = view.state.doc.line(n).text;
    const fieldAwal = SN.jumlahField();
    // Jumlah rentang seleksi = jumlah instance field aktif. Inilah mekanisme
    // sinkron CM6: semua instance \${1} terseleksi sekaligus.
    const rangeAwal = view.state.selection.ranges.length;

    // Mengetik = replaceSelection, yang mengenai SEMUA rentang seleksi.
    // Memakai changes pada satu rentang saja hanya mengubah satu instance —
    // itu bukan cara user mengetik, dan bukan yang diuji brief.
    view.dispatch(view.state.replaceSelection('AKU'));
    await wait(220);
    const setelahEdit = view.state.doc.line(n).text;
    const jumlahAKU = (setelahEdit.match(/AKU/g) || []).length;

    // Tab -> field 2 (\${2:isi}).
    const majuOk = SN.tabStop(true);
    await wait(180);
    const posSetelahTab = view.state.selection.main.from;
    const terpilihSetelahTab = view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    );

    // Shift+Tab -> kembali ke field 1.
    const mundurOk = SN.tabStop(false);
    await wait(180);
    const posSetelahShiftTab = view.state.selection.main.from;
    const rangeSetelahShiftTab = view.state.selection.ranges.length;

    // Esc -> keluar dari mode snippet (dekorasi field hilang).
    SN.keluarSnippet();
    await wait(180);
    const fieldSetelahEsc = SN.jumlahField();

    return JSON.stringify({
      sisip: r,
      baris: n,
      setelahSisip,
      fieldAwal,
      rangeAwal,
      setelahEdit,
      jumlahAKU,
      majuOk,
      mundurOk,
      terpilihSetelahTab,
      posSetelahTab,
      posSetelahShiftTab,
      rangeSetelahShiftTab,
      fieldSetelahEsc,
    })
  `);

  const v3ok =
    !v3.err &&
    v3.sisip === 'ok' &&
    v3.fieldAwal >= 3 &&
    // Field aktif punya DUA instance terseleksi sekaligus (mekanisme sinkron).
    v3.rangeAwal === 2 &&
    // Inti V3a: satu kali mengetik mengubah DUA tempat.
    v3.jumlahAKU === 2 &&
    // Inti V3b: Tab pindah ke field 2 dan menyeleksi teks defaultnya.
    v3.majuOk === true &&
    v3.terpilihSetelahTab === 'isi' &&
    // Shift+Tab kembali ke field 1 (dua instance lagi) di posisi berbeda.
    v3.mundurOk === true &&
    v3.posSetelahTab !== v3.posSetelahShiftTab &&
    v3.rangeSetelahShiftTab === 2 &&
    // Inti V3c: Esc mengakhiri mode snippet.
    v3.fieldSetelahEsc === 0;
  check(
    'F30-V3',
    v3ok,
    v3.err
      ? v3.err
      : `sisip=${v3.sisip} field=${v3.fieldAwal} rangeAwal=${v3.rangeAwal} ` +
        `edit="${String(v3.setelahEdit).slice(0, 40)}" occurrenceAKU=${v3.jumlahAKU} ` +
        `Tab=${v3.majuOk}@${v3.posSetelahTab}/"${v3.terpilihSetelahTab}" ` +
        `ShiftTab=${v3.mundurOk}@${v3.posSetelahShiftTab}/range=${v3.rangeSetelahShiftTab} ` +
        `fieldSetelahEsc=${v3.fieldSetelahEsc}`,
  );
};
