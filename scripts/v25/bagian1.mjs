// v25/bagian1.mjs — V2 & V3 fase 25.

const J = JSON.stringify;

export const bagian1 = async (cdp, check, F) => {
  // ═════════ V2: cari kata umum di workspace, cepat, terkelompok, klik ═══════
  //
  // Query dijalankan di workspace ASLI (D:\Zephyr, ±150 file berisi 'export'
  // setelah .gitignore dihormati) supaya "workspace besar" bukan simulasi.
  const v2 = await cdp.json(
    `
    SR.bersihkan();
    SR.setInclude('');
    SR.setExclude('');
    SR.setFlag({ caseSensitive: true, wholeWord: false, regex: false, respectGitignore: true });
    SR.setQuery('kunciPath');

    const t0 = performance.now();
    const sum = await SR.jalankan();
    const durasiUi = Math.round(performance.now() - t0);
    await wait(600);

    const grup = SR.grup();
    const total = SR.total();

    // Klik hasil PERTAMA lewat DOM (bukan store) supaya jalur klik yang benar
    // yang teruji: baris hasil adalah <button data-testid="sr-hit">.
    const barisPertama = q('[data-testid="sr-hit"]');
    const hit0 = SR.hit(0);
    if (barisPertama) barisPertama.click();
    await wait(1200);

    const S2 = S.getState();
    const tab = S2.tabs.find((t) => t.id === S2.activeTabId);
    const cm = CM();
    // Posisi kursor setelah klik = bukti "sorot & scroll ke match".
    const kursorBaris = cm ? cm.state.doc.lineAt(cm.state.selection.main.head).number : null;
    const kursorKol = cm
      ? cm.state.selection.main.head - cm.state.doc.lineAt(cm.state.selection.main.head).from + 1
      : null;

    // Highlight <mark> di baris hasil: harus tepat teks query.
    const sorot = SR.sorotan(0);

    return JSON.stringify({
      elapsedRust: sum ? sum.elapsedMs : null,
      durasiUi,
      hits: sum ? sum.hits : 0,
      files: sum ? sum.files : 0,
      truncated: sum ? sum.truncated : null,
      rgDipakai: sum ? sum.rg.replace(/^.*[\\\\\\/]/, '') : '',
      err: SR.error(),
      total,
      jmlGrup: grup.length,
      grupPertama: grup[0] || null,
      // tiap grup harus punya >= 1 hit; kalau ada yang 0, pengelompokan salah
      grupKosong: grup.filter((g) => g.n === 0).length,
      hit0,
      tabPath: tab ? tab.path : null,
      kursorBaris,
      kursorKol,
      sorot,
      adaBarisDom: !!barisPertama,
    });
  `,
    240000,
  );

  const cocokFile =
    !!v2.tabPath &&
    !!v2.hit0 &&
    v2.tabPath.replace(/\\\\/g, '/').toLowerCase() ===
      v2.hit0.path.replace(/\\\\/g, '/').toLowerCase();

  check(
    'V2',
    v2.hits > 0 &&
      v2.files > 1 &&
      v2.err === null &&
      v2.durasiUi < 2000 &&
      v2.total === v2.hits &&
      v2.jmlGrup === v2.files &&
      v2.grupKosong === 0 &&
      v2.adaBarisDom &&
      cocokFile &&
      v2.kursorBaris === v2.hit0.line &&
      v2.kursorKol === v2.hit0.col &&
      v2.sorot.length > 0 &&
      v2.sorot.every((s) => s === 'kunciPath'),
    `cari "kunciPath" di D:\\Zephyr → ${v2.hits} match / ${v2.files} file, ` +
      `rg ${v2.elapsedRust}ms, total UI ${v2.durasiUi}ms (< 2000); ` +
      `grup=${v2.jmlGrup} (kosong ${v2.grupKosong}); klik baris pertama → ` +
      `tab ${v2.tabPath} kursor ${v2.kursorBaris}:${v2.kursorKol} ` +
      `(hit ${v2.hit0 ? v2.hit0.line + ':' + v2.hit0.col : '?'}), ` +
      `sorotan ${J(v2.sorot)}, rg=${v2.rgDipakai}, err=${v2.err}`,
  );

  // ═════════ V3: regex + capture group replace, dan .gitignore dihormati ════
  //
  // Dua hal diuji terpisah:
  //  a. .gitignore — folder fixture punya .gitignore sendiri yang mengabaikan
  //     diabaikan.txt. respectGitignore=true harus melewatinya; false harus
  //     menemukannya. root disetel ke folder fixture karena .zephyr/ sendiri
  //     ada di .gitignore repo.
  //  b. regex + $1 — 'nama: Budi' → 'siswa: Budi' lewat capture group.
  const v3 = await cdp.json(
    `
    // ── a. .gitignore dihormati ──
    SR.bersihkan();
    SR.setFlag({ caseSensitive: false, wholeWord: false, regex: false, respectGitignore: true, includeHidden: false });
    SR.setQuery('alpha');
    SR.setRoot(${J(F.dir)});
    const sumHormat = await SR.jalankan();
    await wait(500);
    const fileHormat = SR.grup().map((g) => g.path.replace(/^.*[\\\\\\/]/, '')).sort();

    SR.setFlag({ respectGitignore: false });
    const sumAbai = await SR.jalankan();
    await wait(500);
    const fileAbai = SR.grup().map((g) => g.path.replace(/^.*[\\\\\\/]/, '')).sort();
    SR.setFlag({ respectGitignore: true });

    // ── b. regex + capture group ──
    SR.bersihkan();
    SR.setFlag({ regex: true, caseSensitive: true });
    SR.setQuery('nama: (\\\\w+)');
    SR.setReplaceWith('siswa: $1');
    const sumRegex = await SR.jalankan();
    await wait(500);
    const hitRegex = SR.jumlahHit();
    const fileRegex = SR.grup().map((g) => g.path);

    const nGanti = await SR.replaceSemua();
    await wait(900);

    // Baca isi lewat jalur produk (fsRead), bukan node fs, supaya yang terbukti
    // adalah file yang benar-benar ditulis Rust.
    //
    // fsRead mengembalikan OBJEK ({ content, detectedEncoding, lineEnding,
    // bytes, ... }), bukan string — membandingkannya langsung dengan string
    // selalu false. (Jangan pakai backtick di komentar ini: ia ada DI DALAM
    // template literal, jadi backtick menutupnya lebih awal — jebakan yang
    // sama sudah kena di v26/bagian1.mjs.)
    const bacaan = await window.__ZEPHYR_FS__.read(${J(F.regex)});
    const isiSesudah = bacaan.content;

    return JSON.stringify({
      fileHormat,
      fileAbai,
      hitsHormat: sumHormat ? sumHormat.hits : 0,
      hitsAbai: sumAbai ? sumAbai.hits : 0,
      hitRegex,
      fileRegex,
      nGanti,
      isiSesudah,
      errRegex: SR.error(),
    });
  `,
    240000,
  );

  const gitignoreOk =
    v3.fileHormat.includes('a.txt') &&
    !v3.fileHormat.includes('diabaikan.txt') &&
    v3.fileAbai.includes('diabaikan.txt') &&
    v3.hitsAbai > v3.hitsHormat;

  check(
    'V3',
    gitignoreOk &&
      v3.hitRegex === 3 &&
      v3.nGanti === 3 &&
      v3.isiSesudah === 'siswa: Budi\nsiswa: Ani\nsiswa: Cakra\n' &&
      v3.errRegex === null,
    `.gitignore: hormat=${J(v3.fileHormat)} (${v3.hitsHormat} match) vs ` +
      `--no-ignore=${J(v3.fileAbai)} (${v3.hitsAbai} match); ` +
      `regex "nama: (\\w+)" → ${v3.hitRegex} match di ${v3.fileRegex.length} file, ` +
      `replace all "$1" → ${v3.nGanti} penggantian, isi jadi ${J(v3.isiSesudah)}`,
  );
};
