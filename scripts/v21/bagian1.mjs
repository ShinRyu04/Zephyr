// v21/bagian1.mjs — V2..V3: server start + IntelliSense, diagnostics.

const J = JSON.stringify;

export const bagian1 = async (cdp, check, FILE) => {
  // ═════════ V2: server start + completion + hover + definition ═════════
  const v2 = await cdp.json(
    `
    const L = window.__ZEPHYR_LSP__;
    const P = window.__ZEPHYR_PANEL__;
    P.output.clear('lsp');

    // Sebelum membuka file .ts: tidak boleh ada server sama sekali (LAZY).
    const sebelum = (await L.status()).length;

    await s.openPath(${J(FILE)});
    // tsserver butuh waktu memuat proyek pertama kali.
    await wait(9000);

    const st = S.getState();
    const file = st.tabs.find((t) => t.id === st.activeTabId).path;
    const status = await L.status();
    const docs = L.docs();
    const logLsp = P.output.tail('lsp', 6);
    const cm = window.__ZEPHYR_CM__();

    // Nomor baris DIHITUNG dari isi dokumen, tidak dipatok angka.
    // Pelajaran: fixture pernah digeser 3 baris komentar dan L.goto(8, …)
    // mendarat di dalam KOMENTAR — tsserver benar bila tidak menjawab
    // completion/definition di situ, jadi ujinya salah, bukan produknya.
    const teks = cm.state.doc.toString().split('\\n');
    const barisPakai = teks.findIndex((l) => l.includes('export const hasil')) + 1;
    const kolPakai = teks[barisPakai - 1].indexOf('tambahAngka') + 6;
    const barisDef = teks.findIndex((l) => l.includes('export function tambahAngka')) + 1;

    // Hover di nama fungsi pada deklarasinya.
    L.goto(barisDef, 20);
    await wait(400);
    const hover = await L.hover(file);

    // Completion + definition + references di IDENTIFIER nyata (baris pemakaian).
    L.goto(barisPakai, kolPakai);
    await wait(400);
    const comp = await L.completion(file);
    const def = await L.definition(file);
    const refs = await L.references(file);

    const syms = await L.symbols(file);

    return JSON.stringify({
      sebelum, file, status, docs, logLsp,
      barisPakai, kolPakai, barisDef,
      isiBarisPakai: teks[barisPakai - 1],
      hover: hover ? hover.slice(0, 120) : null,
      compJml: comp.length,
      compAdaTambah: comp.includes('tambahAngka'),
      def, refs: refs.length, syms,
    });
  `,
    150000,
  );
  const srv = v2.status[0];
  check(
    'V2',
    v2.sebelum === 0 &&
      v2.status.length === 1 &&
      srv?.alive === true &&
      srv.pid > 0 &&
      srv.lang === 'typescript' &&
      v2.docs.length === 1 &&
      !!v2.hover &&
      /number/.test(v2.hover) &&
      v2.compJml > 0 &&
      v2.compAdaTambah &&
      !!v2.def &&
      v2.def.line === v2.barisDef &&
      v2.refs >= 3 &&
      v2.syms.includes('tambahAngka'),
    `LAZY terbukti: 0 server sebelum file .ts dibuka → 1 server setelahnya ` +
      `(pid ${srv?.pid}, lang ${srv?.lang}, alive ${srv?.alive}); ` +
      `${v2.docs.length} dokumen didOpen; log Output "LSP" mencatat start. ` +
      `Hover: "${(v2.hover ?? '').replace(/\n/g, ' ').slice(0, 60)}"; ` +
      `completion di ${v2.barisPakai}:${v2.kolPakai} ("${v2.isiBarisPakai}") → ${v2.compJml} item ` +
      `(ada "tambahAngka": ${v2.compAdaTambah}); F12 → line ${v2.def?.line} ` +
      `(deklarasi di ${v2.barisDef}); ${v2.refs} referensi; ${v2.syms.length} simbol dokumen`,
  );

  // ═════════ V3: diagnostics → squiggle + Problems + status bar ═════════
  const v3 = await cdp.json(
    `
    const L = window.__ZEPHYR_LSP__;
    const P = window.__ZEPHYR_PANEL__;
    const st = S.getState();
    const file = st.tabs.find((t) => t.id === st.activeTabId).path;

    const diags = P.problems.forFile(file);
    const counts = P.problems.counts();
    const sq = L.squiggles();
    const gutter = document.querySelectorAll('.cm-diag-marker').length;

    // Badge status bar = DOM, jadi butuh React commit. Diagnostik publish-nya
    // datang di akhir V2, jadi membacanya di baris sinkron pertama V3 pernah
    // menghasilkan "⊗ 0" padahal store sudah 1 — itu artefak pengukuran, bukan
    // bug. Yang benar: TUNGGU sampai DOM menyusul store, dengan batas waktu.
    // Kalau tidak pernah menyusul, itu memang kegagalan nyata.
    const tungguBadge = async (harap) => {
      for (let i = 0; i < 40; i++) {
        const el = q('[data-testid="sb-prob-errors"]');
        if (el && el.textContent.trim() === harap) return { teks: el.textContent.trim(), ms: i * 50 };
        await wait(50);
      }
      const el = q('[data-testid="sb-prob-errors"]');
      return { teks: el ? el.textContent.trim() : null, ms: -1 };
    };
    const badge = await tungguBadge('⊗ ' + counts.errors);
    const jmlBadgeEl = document.querySelectorAll('[data-testid="sb-prob-errors"]').length;

    // Baris yang salah dihitung dari dokumen, bukan angka mati.
    const cm = window.__ZEPHYR_CM__();
    const isi = cm.state.doc.toString();
    const barisSalah =
      isi.split('\\n').findIndex((l) => l.includes('export const salahTipe')) + 1;

    // Jumlah tab: klik baris Problems TIDAK boleh membuat tab duplikat
    // (path dari LSP "d:\\\\x" vs tab "D:/x" — bug nyata fase 21).
    const tabSebelum = S.getState().tabs.length;
    await S.getState().openPath(diags[0] ? diags[0].file : file);
    await wait(700);
    const tabSesudah = S.getState().tabs.length;

    // Perbaiki kesalahannya lewat editor → diagnostics harus HILANG.
    const cm2 = window.__ZEPHYR_CM__();
    const isi2 = cm2.state.doc.toString();
    const posisi = isi2.indexOf('export const salahTipe: string =');
    cm2.dispatch({
      changes: { from: posisi, to: posisi + 'export const salahTipe: string ='.length,
                 insert: 'export const salahTipe: number =' },
    });
    await wait(5000);
    const setelahDiperbaiki = P.problems.forFile(file).filter((d) => d.severity === 'error').length;
    const sqSetelah = L.squiggles();
    const badgeSetelah = await tungguBadge('⊗ 0');

    return JSON.stringify({
      file, barisSalah,
      jml: diags.length,
      pertama: diags[0] ? { line: diags[0].line, col: diags[0].column, sev: diags[0].severity,
                            src: diags[0].source, code: diags[0].code, file: diags[0].file,
                            msg: diags[0].message.slice(0, 80) } : null,
      counts, sq, gutter,
      sbErr: badge.teks, badgeMs: badge.ms, jmlBadgeEl,
      sbErrSetelah: badgeSetelah.teks,
      tabSebelum, tabSesudah,
      setelahDiperbaiki, sqSetelah,
    });
  `,
    120000,
  );
  check(
    'V3',
    v3.jml >= 1 &&
      v3.pertama?.sev === 'error' &&
      v3.pertama?.src === 'LSP' &&
      v3.pertama?.line === v3.barisSalah &&
      v3.counts.errors >= 1 &&
      v3.sq.error >= 1 &&
      v3.gutter >= 1 &&
      v3.jmlBadgeEl === 1 &&
      v3.sbErr === `⊗ ${v3.counts.errors}` &&
      v3.tabSesudah === v3.tabSebelum &&
      v3.setelahDiperbaiki === 0 &&
      v3.sqSetelah.error === 0 &&
      v3.sbErrSetelah === '⊗ 0',
    `tsserver mengirim ${v3.jml} diagnostik: error di line ${v3.pertama?.line}:${v3.pertama?.col} ` +
      `(baris "export const salahTipe" memang ${v3.barisSalah}) source "${v3.pertama?.src}" ` +
      `code ${v3.pertama?.code} — "${v3.pertama?.msg}"; ${v3.sq.error} squiggle + ` +
      `${v3.gutter} gutter marker; badge status bar "${v3.sbErr}" (1 elemen, cocok dengan store ` +
      `${v3.counts.errors} error, DOM menyusul dalam ${v3.badgeMs}ms). Path diagnostik ` +
      `"${v3.pertama?.file}" (drive huruf kecil dari LSP) dibuka ulang → tab tetap ` +
      `${v3.tabSesudah} dari ${v3.tabSebelum}, tidak ada duplikat. Setelah tipe diperbaiki: ` +
      `${v3.setelahDiperbaiki} error, ${v3.sqSetelah.error} squiggle, badge "${v3.sbErrSetelah}" ` +
      `(didChange → publishDiagnostics jalan dua arah)`,
  );
};
