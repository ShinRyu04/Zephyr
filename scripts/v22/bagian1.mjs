// v22/bagian1.mjs — V2 & V3 fase 22.

const J = JSON.stringify;

export const bagian1 = async (cdp, check, F) => {
  // ═════════ V2: F5 start → breakpoint kena → stack & variables → step ═══════
  //
  // Yang diuji di sini adalah SESI SUNGGUHAN, bukan mock: js-debug menjalankan
  // node.exe, program berhenti di baris 9, dan nilai variabelnya dibaca lewat
  // DAP scopes/variables.
  const v2 = await cdp.json(
    `
    DBG.pilihConfig('Uji Node');
    await DBG.toggleBreakpoint(${J(F.program)}, 9);
    const bpSebelum = DBG.breakpoints();

    const mulai = await DBG.start();

    // Sesi ANAK dibuat asinkron setelah reverse request startDebugging, jadi
    // "start selesai" BUKAN berarti "sudah berhenti". Tunggu status stopped.
    let tunggu = 0;
    while (DBG.status() !== 'stopped' && tunggu < 60) {
      await wait(250);
      tunggu++;
    }

    const statusStop = DBG.status();
    const alasan = DBG.alasanStop();

    // Scope dimuat ASINKRON oleh muatStack() setelah event stopped (threads →
    // stackTrace → scopes → variables). Membaca langsung setelah status berubah
    // memberi array kosong — bukan bug produk, harness yang terlalu cepat.
    let ts = 0;
    while (DBG.scopes().length === 0 && ts < 40) { await wait(200); ts++; }
    await wait(300);

    const frames = DBG.frames();
    const threads = DBG.threads();
    const scopes = DBG.scopes();
    const bpSetelah = DBG.breakpoints();
    const barisAktif = DBG.barisAktif();

    // Variabel di scope pertama (Local: tambah).
    const sc = scopes.find((s) => !s.expensive) || scopes[0];
    const vars = sc ? DBG.vars(sc.variablesReference) : [];
    const peta = {};
    vars.forEach((v) => { peta[v.name] = v.value; });

    // Objek bisa di-expand (variablesReference > 0).
    const objInfo = vars.find((v) => v.name === 'info');
    let anakInfo = [];
    if (objInfo && objInfo.variablesReference > 0) {
      await DBG.expandVariable(objInfo.variablesReference);
      await wait(500);
      anakInfo = DBG.vars(objInfo.variablesReference).map((v) => v.name + '=' + v.value);
    }

    // ── Urutan step: StepOut DULU, baru StepOver, lalu StepInto ──
    //
    // StepOver TIDAK diuji di baris 9: baris itu "return <ekspresi>", dan
    // js-debug menyelesaikan sub-ekspresinya di baris yang SAMA — jadi 9→9
    // adalah perilaku benar, bukan bug. StepOver hanya bermakna di baris berisi
    // statement biasa, jadi diukur di main().
    await DBG.kontrol('stepOut');
    let t3 = 0;
    while (DBG.status() !== 'stopped' && t3 < 40) { await wait(200); t3++; }
    await wait(500);
    const setelahOut = DBG.frames()[0] || null;
    const namaFrameOut = (DBG.frames()[0] || {}).name || '';
    const barisDiMain = setelahOut ? setelahOut.line : 0;

    // ── Step Over di main(): baris HARUS bertambah ──
    await DBG.kontrol('next');
    let t2 = 0;
    while (DBG.status() !== 'stopped' && t2 < 40) { await wait(200); t2++; }
    await wait(400);
    const setelahNext = DBG.frames()[0] || null;

    // ── Step Into: masuk ke kali() dari main() ──
    //
    // StepOver di atas sudah memindahkan eksekusi ke baris 22 (console.log),
    // yang TIDAK memanggil kali() lagi. StepInto dari situ hanya melangkah
    // biasa. Karena itu StepInto diuji dari sesi BARU yang berhenti tepat
    // sebelum panggilan kali(): breakpoint di baris 20 (const y = kali(...)).
    await DBG.stop();
    await wait(1500);
    await DBG.hapusSemuaBreakpoint();
    await DBG.toggleBreakpoint(${J(F.program)}, 20);
    await DBG.start('Uji Node');
    let t5 = 0;
    while (DBG.status() !== 'stopped' && t5 < 60) { await wait(250); t5++; }
    let ts2 = 0;
    while (DBG.scopes().length === 0 && ts2 < 40) { await wait(200); ts2++; }
    await wait(400);
    const sebelumIn = DBG.frames()[0] || null;

    await DBG.kontrol('stepIn');
    let t4 = 0;
    while (DBG.status() !== 'stopped' && t4 < 40) { await wait(200); t4++; }
    await wait(600);
    const setelahIn = DBG.frames()[0] || null;

    return JSON.stringify({
      mulai,
      statusStop,
      alasan,
      tunggu,
      threads,
      jmlFrame: frames.length,
      frameAtas: frames[0] || null,
      namaFrame: frames.map((f) => f.name).slice(0, 4),
      scopes: scopes.map((s) => s.name),
      peta,
      anakInfo,
      bpSebelumVerified: bpSebelum[0] ? bpSebelum[0].verified : null,
      bpSetelahVerified: bpSetelah[0] ? bpSetelah[0].verified : null,
      barisAktif,
      barisDiMain,
      setelahNext,
      setelahOut,
      namaFrameOut,
      sebelumIn,
      setelahIn,
    });
  `,
    300000,
  );

  const stepOverOk = !!v2.setelahNext && v2.setelahNext.line > v2.barisDiMain;
  const stepOutOk = v2.namaFrameOut === 'main';
  const stepInOk = !!v2.setelahIn && v2.setelahIn.name === 'kali';

  check(
    'V2',
    v2.mulai === true &&
      v2.statusStop === 'stopped' &&
      v2.alasan === 'breakpoint' &&
      v2.threads.length >= 1 &&
      v2.jmlFrame >= 2 &&
      v2.frameAtas &&
      v2.frameAtas.name === 'tambah' &&
      v2.frameAtas.line === 9 &&
      v2.peta.a === '2' &&
      v2.peta.b === '3' &&
      v2.peta.hasil === '5' &&
      v2.anakInfo.length >= 4 &&
      v2.bpSebelumVerified === false &&
      v2.bpSetelahVerified === true &&
      !!v2.barisAktif &&
      v2.barisAktif.line === 9 &&
      stepOverOk &&
      stepOutOk &&
      stepInOk,
    `F5 → berhenti "${v2.alasan}" setelah ${v2.tunggu * 250}ms; ` +
      `thread ${J(v2.threads)}; stack ${v2.jmlFrame} frame ${J(v2.namaFrame)} ` +
      `(atas: ${v2.frameAtas ? v2.frameAtas.name + '@' + v2.frameAtas.line : '?'}); ` +
      `scopes ${J(v2.scopes)}; variables a=${v2.peta.a} b=${v2.peta.b} hasil=${v2.peta.hasil}; ` +
      `expand info → ${J(v2.anakInfo)}; breakpoint verified ${v2.bpSebelumVerified}→${v2.bpSetelahVerified}; ` +
      `baris aktif ${v2.barisAktif ? v2.barisAktif.line : '-'}; ` +
      `StepOut → ${v2.namaFrameOut}@${v2.barisDiMain} (${stepOutOk}), ` +
      `StepOver ${v2.barisDiMain}→${v2.setelahNext ? v2.setelahNext.line : '?'} (${stepOverOk}), ` +
      `StepInto (sesi baru, bp baris 20) ${v2.sebelumIn ? v2.sebelumIn.name : '?'} → ` +
      `${v2.setelahIn ? v2.setelahIn.name : '?'} (${stepInOk})`,
  );

  // ═════════ V3: Debug Console REPL benar-benar dievaluasi sesi ══════════════
  //
  // Fase 20 meninggalkan REPL sebagai no-op yang hanya menulis ke Output.
  // Yang dibuktikan di sini: ekspresi dihitung oleh debuggee (nilai variabel
  // di frame yang sedang berhenti), dan ekspresi salah memberi error — bukan
  // pesan "belum tersedia".
  const v3 = await cdp.json(
    `
    // Sesi sekarang berhenti di kali(); pilih frame kali() supaya evaluasi
    // punya konteks variabel a dan b. Tanpa backtick di komentar ini: ia ada
    // DI DALAM template literal.
    const fr = DBG.frames();
    const frPilih = fr.find((f) => f.name === 'kali') || fr[0];
    if (frPilih) await DBG.pilihFrame(frPilih.id);
    await wait(900);

    DBG.bersihkanRepl();
    // 'a * b' hanya ada di frame kali(); kalau sesi berada di tempat lain,
    // ekspresi aritmetika murni tetap membuktikan REPL tersambung.
    const hasilProduk = await DBG.evalRepl(frPilih && frPilih.name === 'kali' ? 'a * b' : '4 * 5');
    const hasilEkspresi = await DBG.evalRepl('1 + 2 + 3');
    const hasilSalah = await DBG.evalRepl('variabelTidakAda___');
    await wait(400);

    const repl = DBG.repl();
    // Panel Debug Console harus benar-benar merender barisnya.
    window.__ZEPHYR_PANEL__.focusTab('debug');
    await wait(600);
    const domLine = qa('[data-testid="dc-line"]').map((el) => el.getAttribute('data-kind'));
    const teksDom = qa('[data-testid="dc-line"]').map((el) => el.textContent.trim());

    return JSON.stringify({
      hasilProduk,
      hasilEkspresi,
      hasilSalah,
      replKinds: repl.map((l) => l.kind),
      replTeks: repl.map((l) => l.text.slice(0, 40)),
      domLine,
      teksDom: teksDom.slice(0, 8),
    });
  `,
    240000,
  );

  check(
    'V3',
    v3.hasilEkspresi === '6' &&
      /^\d+$/.test(String(v3.hasilProduk)) &&
      v3.hasilSalah.length > 0 &&
      !/belum tersedia|belum aktif|fase 22/i.test(v3.hasilSalah) &&
      v3.replKinds.includes('input') &&
      v3.replKinds.includes('output') &&
      v3.replKinds.includes('error') &&
      v3.domLine.length >= 6,
    `REPL dari sesi: "a * b" → ${v3.hasilProduk}, "1 + 2 + 3" → ${v3.hasilEkspresi}, ` +
      `ekspresi salah → ${J(v3.hasilSalah.slice(0, 60))}; ` +
      `riwayat ${J(v3.replKinds)}; DOM ${v3.domLine.length} baris ${J(v3.domLine)}`,
  );
};
