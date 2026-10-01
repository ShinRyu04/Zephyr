// v23/bagian1.mjs — V2 & V3 fase 23.

const J = JSON.stringify;

export const bagian1 = async (cdp, check) => {
  // ═════════ V2: tasks.json terbaca + Run Build Task + Output + Problems ═════
  const v2 = await cdp.json(
    `
    // Muat ulang dari disk supaya hasilnya bukan sisa state lama.
    const f = await TK.muat();
    const daftar = TK.daftar();
    const errors = TK.errors();
    const build = TK.buildDefault();

    // Bersihkan channel + problems sumber task sebelum menjalankan.
    const label = 'uji: build tsc';
    const P = () => TK.problems(label);

    // Jalankan lewat jalur PRODUK (store), bukan invoke langsung.
    const run = await TK.jalankan(label);

    // Tunggu event task-exit sempat memproses problem (emit → listener → store).
    let out = [];
    for (let i = 0; i < 40; i++) {
      await wait(250);
      out = TK.output(label);
      if (P().length >= 3) break;
    }

    const problems = P();
    const channels = TK.channels();

    // Bukti file:line bisa dibuka: ambil satu problem lalu buka lewat store.
    // Kalau path-nya salah bentuk, openPath akan gagal / tab tidak muncul.
    let tabTerbuka = null;
    const satu = problems.find((p) => p.line === 12) ?? problems[0];
    if (satu) {
      try {
        await S.getState().openPath(satu.file);
        await wait(900);
        const t = S.getState().tabs.find((x) => x.id === S.getState().activeTabId);
        tabTerbuka = t
          ? { path: t.path, ada: true, baris: (t.content || '').split('\\n').length }
          : { ada: false, jmlTab: S.getState().tabs.length };
      } catch (e) {
        // Error dari invoke Rust itu OBJEK, bukan Error — String(e) memberi
        // "[object Object]" yang tidak berguna saat mendiagnosis.
        tabTerbuka = { ada: false, error: e && e.message ? e.message : JSON.stringify(e) };
      }
    }

    return JSON.stringify({
      path: TK.path(),
      versi: f ? f.version : null,
      jmlTask: daftar.length,
      label: daftar.map((t) => t.label),
      errors,
      build,
      buildMatchers: (daftar.find((t) => t.label === label) || {}).matchers,
      status: run ? run.status : null,
      exitCode: run ? run.exitCode : null,
      barisOutput: out.length,
      adaBarisTsc: out.some((l) => l.includes('error TS2322')),
      adaChannel: channels.includes('task:' + label),
      problems: problems.map((p) => ({
        f: p.file.replace(/\\\\/g, '/').split('/').slice(-2).join('/'),
        l: p.line,
        c: p.column,
        s: p.severity,
        code: p.code,
        src: p.source,
      })),
      tabTerbuka,
      recent: TK.recent().slice(0, 3),
      commandsDiPalette: TK.commandsDiPalette().filter((c) => c.startsWith('task.')).length,
    });
  `,
    180000,
  );

  const p12 = (v2.problems || []).find((x) => x.l === 12);
  check(
    'V2',
    v2.jmlTask === 8 &&
      v2.errors.length === 1 &&
      v2.build === 'uji: build tsc' &&
      v2.status === 'failed' &&
      v2.exitCode === 2 &&
      v2.adaChannel === true &&
      v2.adaBarisTsc === true &&
      v2.problems.length === 3 &&
      !!p12 &&
      p12.s === 'error' &&
      p12.code === 'TS2322' &&
      p12.src === 'task:uji: build tsc' &&
      !!(v2.tabTerbuka && v2.tabTerbuka.ada),
    `tasks.json (JSONC + komentar) → ${v2.jmlTask} task valid dari 9 entri; ` +
      `1 entri rusak ditolak: ${J(v2.errors)}. Build default = ${J(v2.build)} ` +
      `matcher ${J(v2.buildMatchers)}. Run: status=${v2.status} exit=${v2.exitCode}, ` +
      `${v2.barisOutput} baris masuk channel "task:uji: build tsc" (ada=${v2.adaChannel}). ` +
      `Problems dari matcher: ${J(v2.problems)}. ` +
      `Klik file:line membuka tab: ${J(v2.tabTerbuka)}. ` +
      `${v2.commandsDiPalette} task terdaftar di palette, recent=${J(v2.recent)}`,
  );

  // ═════════ V3: dependsOn urut + watch background terdeteksi siap ═════════
  const v3 = await cdp.json(
    `
    // Rantai: "uji: rantai" dependsOn [langkah satu, langkah dua] sequence.
    const t0 = Date.now();
    const run = await TK.jalankan('uji: rantai');
    const runs = TK.runs();

    // Urutan dibuktikan dari urutan run yang tercatat, bukan dari asumsi.
    const urut = runs
      .filter((r) => r.label.startsWith('uji: langkah') || r.label === 'uji: rantai')
      .map((r) => r.label);

    const outSatu = TK.output('uji: langkah satu');
    const outDua = TK.output('uji: langkah dua');
    const outRantai = TK.output('uji: rantai');

    // ── watch background ──
    const w = await TK.jalankan('uji: watch');
    // Ronde 1 kena endsPattern lebih dulu ("Found 1 errors"), lalu
    // beginsPattern ronde 2, lalu endsPattern ronde 2 ("Found 0 errors").
    // BUG HARNESS sebelumnya: loop berhenti pada siap=true ronde 1, jadi
    // ronde 2 belum pernah terjadi saat diperiksa. Tunggu ronde 2 selesai.
    let siapRonde1 = false;
    let siap = false;
    for (let i = 0; i < 80; i++) {
      await wait(250);
      if (!w) break;
      if (!siapRonde1 && TK.siap(w.id)) siapRonde1 = true;
      const o = TK.output('uji: watch');
      if (o.some((l) => l.includes('Found 0 errors'))) {
        // Beri jeda agar event task-round ronde 2 selesai diproses store.
        await wait(500);
        siap = TK.siap(w.id);
        break;
      }
    }
    const outWatch = w ? TK.output('uji: watch') : [];
    const pWatch = w ? TK.problems('uji: watch') : [];
    const statusWatch = w ? (TK.runs().find((r) => r.id === w.id) || {}).status : null;

    return JSON.stringify({
      rantaiStatus: run ? run.status : null,
      urut,
      outSatu: outSatu.filter((l) => l.includes('langkah satu selesai')).length,
      outDua: outDua.filter((l) => l.includes('langkah dua selesai')).length,
      outRantai: outRantai.filter((l) => l.includes('rantai selesai')).length,
      msRantai: Date.now() - t0,
      watchId: w ? w.id : null,
      watchStatus: statusWatch,
      siapRonde1,
      siap,
      barisWatch: outWatch.length,
      adaRonde1: outWatch.some((l) => l.includes('Found 1 errors')),
      adaRonde2: outWatch.some((l) => l.includes('Found 0 errors')),
      problemWatch: pWatch.length,
    });
  `,
    180000,
  );

  const urutBenar =
    v3.urut.indexOf('uji: langkah satu') >= 0 &&
    v3.urut.indexOf('uji: langkah satu') < v3.urut.indexOf('uji: langkah dua') &&
    v3.urut.indexOf('uji: langkah dua') < v3.urut.indexOf('uji: rantai');

  check(
    'V3',
    v3.rantaiStatus === 'done' &&
      urutBenar &&
      v3.outSatu === 1 &&
      v3.outDua === 1 &&
      v3.outRantai === 1 &&
      v3.siapRonde1 === true &&
      v3.siap === true &&
      v3.watchStatus === 'running' &&
      v3.adaRonde1 === true &&
      v3.adaRonde2 === true &&
      v3.problemWatch === 0,
    `dependsOn sequence jalan URUT ${J(v3.urut)} (${v3.msRantai}ms), tiap langkah ` +
      `mencetak tepat 1 baris penanda. Watch isBackground: status=${v3.watchStatus} ` +
      `(tetap hidup) setelah ${v3.barisWatch} baris. endsPattern ronde 1 → siap=` +
      `${v3.siapRonde1}, ronde 2 → siap=${v3.siap}. ` +
      `Ronde 1 "Found 1 errors"=${v3.adaRonde1}, ronde 2 "Found 0 errors"=${v3.adaRonde2}, ` +
      `problem tersisa=${v3.problemWatch} (beginsPattern ronde 2 membersihkan error ronde 1)`,
  );
};
