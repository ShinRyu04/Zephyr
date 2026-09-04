// v31/bagian2.mjs — V4 (kontras), V5 (reduced motion + zoom), V6 (axe-core).
//
// PERINGATAN PERMANEN: JANGAN pakai backtick di komentar DI DALAM template
// literal — template tertutup lebih awal dan node --check tetap lolos.

const J = (s) => JSON.stringify(s);

export const bagian2 = async (cdp, check, F, { fs, spawnSync, path }) => {
  // ═════════ V4: kontras semua tema >= AA + high contrast AAA ═════════
  //
  // DUA pengukuran independen:
  //   1. scripts/a11y-kontras.mjs — parse file CSS (semua 7 tema sekaligus);
  //   2. AY.kontras() di app hidup — getComputedStyle, warna yang BENAR-BENAR
  //      dipakai browser.
  // Kalau keduanya sepakat, angkanya bisa dipercaya. Kalau tidak, ada token
  // yang ditimpa runtime (mis. accent kustom) dan itu justru yang mau diketahui.
  const audit = spawnSync(process.execPath, [path.join(F.akar, 'scripts/a11y-kontras.mjs'), '--json'], {
    cwd: F.akar,
    encoding: 'utf8',
    timeout: 120000,
  });
  let ringkas = null;
  try {
    ringkas = JSON.parse(audit.stdout || '{}');
  } catch {
    ringkas = null;
  }
  const totalGagal = ringkas
    ? Object.values(ringkas).reduce((n, r) => n + r.gagal + r.takTerbaca, 0)
    : -1;
  const jumlahTema = ringkas ? Object.keys(ringkas).length : 0;

  // Terapkan high-contrast lewat jalur produk lalu ukur dari DOM hidup.
  const v4live = await cdp.json(`
    const st = S.getState();
    const temaAwal = st.settings.theme.current;
    await st.applySettings({ theme: { current: 'high-contrast' }, general: { theme: 'dark' } });
    await wait(500);
    const attr = AY.atribut();
    const ukur = {
      teksBg: AY.kontras('--text', '--bg'),
      teksSurface: AY.kontras('--text', '--surface'),
      mutedSurface: AY.kontras('--text-muted', '--surface'),
      gutter: AY.kontras('--editor-gutter', '--editor-bg'),
      komentar: AY.kontras('--syn-comment', '--editor-bg'),
      danger: AY.kontras('--danger', '--surface'),
    };
    // Kembalikan ke tema semula supaya harness lain tidak terpengaruh.
    await st.applySettings({ theme: { current: temaAwal }, general: { theme: 'dark' } });
    await wait(400);
    return JSON.stringify({ temaAwal, attr, ukur, temaSekarang: AY.atribut().theme })
  `);

  const u = v4live.ukur || {};
  const semuaAAA = [u.teksBg, u.teksSurface, u.mutedSurface, u.gutter, u.komentar, u.danger].every(
    (x) => typeof x === 'number' && x >= 7,
  );
  const v4ok =
    totalGagal === 0 &&
    jumlahTema >= 7 &&
    v4live.attr.theme === 'high-contrast' &&
    semuaAAA &&
    v4live.temaSekarang === v4live.temaAwal;
  check(
    'F31-V4',
    v4ok,
    `${jumlahTema} tema, pelanggaran AA=${totalGagal} | high-contrast (dari DOM hidup): ` +
      `teks/bg=${u.teksBg} teks/surface=${u.teksSurface} muted=${u.mutedSurface} ` +
      `gutter=${u.gutter} komentar=${u.komentar} danger=${u.danger} → semua >=7 (AAA)=${semuaAAA} | ` +
      `tema dikembalikan ke ${v4live.temaSekarang}`,
  );

  // ═════════ V5: reduced motion + font scaling ═════════
  const v5 = await cdp.json(`
    const st = S.getState();
    const a = st.settings.accessibility || {};
    const zoomAwal = st.settings.general.zoom;

    // ── 5a. setelan app menyalakan atribut + mematikan transisi ──
    await st.applySettings({
      accessibility: { ...a, reducedMotion: true, screenReader: false,
                       autoFocusDialog: true, toastDurasiMin: 3200 },
    });
    await wait(400);
    const attrOn = AY.atribut();

    // Ukur transition-duration NYATA pada elemen yang punya transisi.
    // .btn dipilih karena index.css memberinya transition.
    const btn = q('.btn') || q('button');
    const durOn = btn ? getComputedStyle(btn).transitionDuration : null;

    await st.applySettings({
      accessibility: { ...a, reducedMotion: false, screenReader: false,
                       autoFocusDialog: true, toastDurasiMin: 3200 },
    });
    await wait(400);
    const attrOff = AY.atribut();
    const durOff = btn ? getComputedStyle(btn).transitionDuration : null;

    // ── 5b. mode screen reader menyalakan xterm SR-mode ──
    await st.applySettings({
      accessibility: { ...a, reducedMotion: false, screenReader: true,
                       autoFocusDialog: true, toastDurasiMin: 3200 },
    });
    await wait(450);
    const srAttr = AY.atribut().screenReader;

    await st.applySettings({
      accessibility: { ...a, reducedMotion: false, screenReader: false,
                       autoFocusDialog: true, toastDurasiMin: 3200 },
    });
    await wait(350);

    // ── 5c. font scaling 50% dan 200% tidak merusak layout ──
    const ukurLayout = () => {
      const root = q('.app-root');
      const body = q('.app-body');
      const main = q('.main-area');
      return {
        rootW: root ? root.clientWidth : 0,
        bodyH: body ? body.clientHeight : 0,
        mainW: main ? main.clientWidth : 0,
        // Overflow horizontal = layout pecah.
        scrollXBody: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        fontRoot: getComputedStyle(document.documentElement).fontSize,
      };
    };

    const l100 = ukurLayout();
    await st.applySettings({ general: { zoom: 200 } });
    await wait(500);
    const l200 = ukurLayout();
    await st.applySettings({ general: { zoom: 50 } });
    await wait(500);
    const l50 = ukurLayout();
    await st.applySettings({ general: { zoom: zoomAwal } });
    await wait(450);
    const lBalik = ukurLayout();

    return JSON.stringify({
      attrOn: attrOn.reducedMotion, attrOff: attrOff.reducedMotion,
      durOn, durOff, srAttr,
      osReduced: AY.osReducedMotion(),
      l100, l200, l50, lBalik, zoomAwal,
    })
  `);

  // transitionDuration bisa berisi beberapa nilai ("0.15s, 0.2s") — cek semua.
  const durasiHampirNol = (s) =>
    typeof s === 'string' &&
    s
      .split(',')
      .map((x) => parseFloat(x))
      .every((n) => !Number.isNaN(n) && n <= 0.001);

  const v5ok =
    v5.attrOn === 'true' &&
    v5.attrOff === null &&
    // Inti V5a: transisi BENAR-BENAR nol saat reduced motion, bukan hanya atribut.
    durasiHampirNol(v5.durOn) &&
    !durasiHampirNol(v5.durOff) &&
    v5.srAttr === 'true' &&
    // Inti V5b: zoom ekstrem tidak menimbulkan overflow horizontal.
    v5.l200.scrollXBody <= 1 &&
    v5.l50.scrollXBody <= 1 &&
    // Font root benar-benar berubah (bukti zoom terpakai).
    v5.l200.fontRoot !== v5.l100.fontRoot &&
    v5.l50.fontRoot !== v5.l100.fontRoot &&
    // Layout kembali normal setelah zoom dipulihkan.
    v5.lBalik.fontRoot === v5.l100.fontRoot;
  check(
    'F31-V5',
    v5ok,
    `reducedMotion attr on/off=${v5.attrOn}/${v5.attrOff} transition="${v5.durOn}"/"${v5.durOff}" ` +
      `| srMode=${v5.srAttr} | osReduced=${v5.osReduced} | ` +
      `zoom 100%→${v5.l100.fontRoot} 200%→${v5.l200.fontRoot} 50%→${v5.l50.fontRoot} ` +
      `overflowX 200%=${v5.l200.scrollXBody} 50%=${v5.l50.scrollXBody}`,
  );

  // ═════════ V6: axe-core 0 critical/serious ═════════
  //
  // Kode axe disuntik dari node_modules ke halaman, lalu dijalankan pada
  // dokumen HIDUP. Bukan mode headless: yang diuji adalah UI yang benar-benar
  // dirender WebView2, termasuk semua state yang sudah dibuka harness ini.
  let axeJs = '';
  try {
    axeJs = fs.readFileSync(F.axeJs, 'utf8');
  } catch {
    axeJs = '';
  }
  if (!axeJs) {
    check('F31-V6', false, `axe-core tidak ditemukan di ${F.axeJs}`);
    return;
  }

  // Suntik lewat Runtime.evaluate biasa (bukan cdp.json) karena isinya besar.
  await cdp.eval(axeJs + '\n;window.__axeSiap = typeof window.axe === "object";');
  const siap = await cdp.eval('window.__axeSiap === true');

  // axe dijalankan dengan runOnly rule set WCAG 2.1 A/AA — itu yang diminta
  // brief. Aturan "region" dimatikan: seluruh app adalah satu aplikasi
  // dashboard, bukan dokumen dengan landmark per bagian, dan axe menandai
  // setiap teks di luar landmark sebagai pelanggaran.
  const hasilAxe = await cdp.json(`
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { region: { enabled: false } },
      resultTypes: ['violations'],
    });
    const ringkas = r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      jumlah: v.nodes.length,
      target: v.nodes[0] ? String(v.nodes[0].target[0]).slice(0, 60) : null,
      pesan: String(v.description).slice(0, 80),
    }));
    return JSON.stringify({
      total: r.violations.length,
      ringkas,
      critical: ringkas.filter((x) => x.impact === 'critical').length,
      serious: ringkas.filter((x) => x.impact === 'serious').length,
      moderate: ringkas.filter((x) => x.impact === 'moderate').length,
      minor: ringkas.filter((x) => x.impact === 'minor').length,
      lolos: r.passes ? r.passes.length : -1,
    })
  `);

  const v6ok =
    siap === true &&
    hasilAxe.critical === 0 &&
    hasilAxe.serious === 0;
  check(
    'F31-V6',
    v6ok,
    `axe-core: critical=${hasilAxe.critical} serious=${hasilAxe.serious} ` +
      `moderate=${hasilAxe.moderate} minor=${hasilAxe.minor}` +
      (hasilAxe.ringkas && hasilAxe.ringkas.length
        ? // Target disertakan: tanpa itu "aria-required-children x24" tidak
          // memberi tahu elemen mana, dan diagnosisnya harus diulang dari nol.
          ` | ${hasilAxe.ringkas
            .slice(0, 4)
            .map((x) => `${x.id}[${x.impact}]x${x.jumlah}@${x.target}`)
            .join(' ')}`
        : ' | tidak ada pelanggaran'),
  );

  // Pembersihan: tutup Settings + semua tab, dan PULIHKAN workspace.
  //
  // Memulihkan workspace itu wajib, bukan kesopanan: uji di atas membuka file
  // fixture dan mengubah root, sedangkan `extensions_load` (fase 29) MENOLAK
  // jalan tanpa workspace terbuka — verify13 V7 gagal karena itu, padahal
  // ekstensinya benar. (Pelajaran fase 28 dengan Settings, bentuk berbeda.)
  await cdp.json(`
    const st = S.getState();
    st.setSettingsOpen(false);
    for (const t of [...st.tabs]) st.forceCloseTab(t.id);
    await st.openWorkspace('D:/Zephyr');
    await wait(700);
    AY.bersihkan();
    return JSON.stringify({
      tabs: S.getState().tabs.length,
      workspace: S.getState().workspace,
    })
  `);
};
