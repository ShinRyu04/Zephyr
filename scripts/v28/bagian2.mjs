// v28/bagian2.mjs — V4, V5, V6 fase 28.
//
// PERINGATAN: jangan pakai backtick di komentar yang ada di dalam template
// literal (kena 4 kali di fase 22/25/26).

import { spawnSync } from 'node:child_process';

const J = JSON.stringify;

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

export const bagian2 = async (cdp, check, F, { jalankanExe, fs }) => {
  const norm = (s) => String(s || '').replace(/\\/g, '/').toLowerCase();

  // ═══════════════ V4: zephyr --diff A B → DiffViewer terisi ═══════════════
  const v4 = await cdp.json(`
    CLI.tutupDiff();
    await wait(300);
    const diffSebelum = CLI.diff();

    CLI.bersihkan();
    const args = await CLI.parse(['--diff', ${J(F.diffA)}, ${J(F.diffB)}], 'D:/Zephyr');
    await CLI.jalankan(args);
    await wait(1200);

    const d = CLI.diff();
    // DiffViewer benar-benar merender: hitung baris +/- di DOM, bukan hanya
    // memeriksa state.
    const domAdd = qa('.diff-line.is-add').length;
    const domDel = qa('.diff-line.is-del').length;
    return JSON.stringify({
      diffSebelum: diffSebelum === null,
      bentuk: Object.keys(args.targets[0] || {}),
      kiri: (args.targets[0] || {}).diff ? args.targets[0].diff.kiri : '',
      kanan: (args.targets[0] || {}).diff ? args.targets[0].diff.kanan : '',
      adaDiff: !!d,
      path: d ? d.path : '',
      source: d ? d.source : '',
      punyaLama: d ? d.teks.includes('-LAMA-tiga') : false,
      punyaBaru: d ? d.teks.includes('+BARU-tiga') : false,
      domAdd,
      domDel,
      errors: args.errors,
    })
  `);

  const v4ok =
    v4.diffSebelum &&
    v4.bentuk.join() === 'diff' &&
    norm(v4.kiri) === norm(F.diffA) &&
    norm(v4.kanan) === norm(F.diffB) &&
    v4.adaDiff &&
    v4.punyaLama &&
    v4.punyaBaru &&
    v4.domAdd >= 1 &&
    v4.domDel >= 1 &&
    v4.errors.length === 0;

  check(
    'F28-V4',
    v4ok,
    `parse ${J(v4.bentuk)} (${v4.kiri.split('/').pop()} vs ${v4.kanan.split('/').pop()}); ` +
      `diff "${v4.path}" source=${v4.source}; -LAMA ${v4.punyaLama} +BARU ${v4.punyaBaru}; ` +
      `DOM +${v4.domAdd}/-${v4.domDel}`,
  );

  // Tutup diff: panel ini menutupi editor dan harness fase 02/03 memeriksa
  // empty-state (pelajaran fase 10).
  await cdp.json(
    `CLI.tutupDiff(); await wait(200); return JSON.stringify({ ok: CLI.diff() === null })`,
  );

  // ═══ V5: instance kedua meneruskan argv, TIDAK membuka jendela baru ═══
  //
  // Ini uji PROSES NYATA: exe dijalankan lagi dari shell. Plugin
  // single-instance harus membuat proses itu keluar dan mengirim argv ke
  // jendela yang sudah hidup.
  const sebelum = await cdp.json(`
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    CLI.bersihkan();
    await wait(400);
    return JSON.stringify({ tabs: S.getState().tabs.length, jalan: CLI.jumlahJalan() })
  `);

  const pidSebelum = hitungProsesZephyr();

  // Instance kedua: buka file target di baris 7.
  const r5 = jalankanExe([`${F.target.replace(/\//g, '\\')}:7:3`], { timeout: 25000 });
  await tidur(3500);

  const pidSesudah = hitungProsesZephyr();

  const sesudah = await cdp.json(`
    const st = S.getState();
    const tab = st.tabs.find((t) => t.id === st.activeTabId);
    const view = window.__ZEPHYR_CM__();
    let baris = 0;
    if (view) baris = view.state.doc.lineAt(view.state.selection.main.head).number;
    const t = CLI.terakhir();
    return JSON.stringify({
      tabs: st.tabs.length,
      jalan: CLI.jumlahJalan(),
      pathTab: tab ? tab.path : '',
      baris,
      targetTerakhir: t ? t.targets : null,
    })
  `);

  const v5ok =
    sesudah.jalan === sebelum.jalan + 1 &&
    sesudah.tabs === sebelum.tabs + 1 &&
    norm(sesudah.pathTab) === norm(F.target) &&
    sesudah.baris === 7 &&
    // Instance kedua HARUS keluar: jumlah proses zephyr.exe tidak bertambah.
    pidSesudah <= pidSebelum &&
    r5.status === 0;

  check(
    'F28-V5',
    v5ok,
    `exe kedua exit ${r5.status}; proses zephyr ${pidSebelum} -> ${pidSesudah}; ` +
      `jumlahJalan ${sebelum.jalan} -> ${sesudah.jalan}; tab ${sebelum.tabs} -> ${sesudah.tabs} ` +
      `baris ${sesudah.baris}`,
  );

  // ═══════════ V6: --wait menahan shell sampai file ditutup ═══════════
  //
  // Shim .cmd yang diuji, bukan hanya exe: itu yang benar-benar dipakai git
  // sebagai core.editor.
  const shim = `${process.env.LOCALAPPDATA}\\Programs\\zephyr\\bin\\zephyr.cmd`;
  const shimAda = fs.existsSync(shim);

  let v6detail = 'shim tidak ada';
  let v6ok = false;

  if (shimAda) {
    await cdp.json(`
      for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
      CLI.bersihkan();
      await wait(400);
      return JSON.stringify({ ok: true })
    `);

    const { spawn } = await import('node:child_process');
    const mulai = Date.now();
    const anak = spawn('cmd.exe', ['/c', shim, '--wait', F.commitMsg.replace(/\//g, '\\')], {
      windowsHide: true,
      stdio: 'ignore',
    });

    let keluar = null;
    anak.on('exit', (c) => {
      keluar = { code: c, ms: Date.now() - mulai };
    });

    // Tunggu app menerima argumen & mencatat token wait.
    await tidur(4000);
    const tengah = await cdp.json(`
      const st = S.getState();
      const m = CLI.menunggu();
      const kunci = Object.keys(m);
      let aktif = false;
      if (kunci.length) aktif = await CLI.waitAktif(m[kunci[0]]);
      return JSON.stringify({
        tabs: st.tabs.length,
        kunci,
        token: kunci.length ? m[kunci[0]] : '',
        penandaAktif: aktif,
      })
    `);

    const masihJalanSaatTabTerbuka = keluar === null;

    // Tutup tab → penanda dihapus → shim berhenti menunggu.
    await cdp.json(`
      const st = S.getState();
      const tab = st.tabs.find((t) => (t.path || '').toLowerCase().includes('commit_editmsg'));
      if (tab) st.forceCloseTab(tab.id);
      await wait(600);
      return JSON.stringify({ sisa: Object.keys(CLI.menunggu()).length })
    `);

    // Shim polling tiap ~1s (ping -n 2), beri kelonggaran.
    for (let i = 0; i < 20 && keluar === null; i++) await tidur(500);
    if (keluar === null) anak.kill();

    v6ok =
      tengah.kunci.length === 1 &&
      tengah.penandaAktif === true &&
      masihJalanSaatTabTerbuka &&
      keluar !== null &&
      keluar.code === 0;

    v6detail =
      `tab dibuka ${tengah.tabs}, token ${tengah.token} penanda-aktif ${tengah.penandaAktif}; ` +
      `masih menunggu saat tab terbuka ${masihJalanSaatTabTerbuka}; ` +
      `setelah tab ditutup shim exit ${keluar ? keluar.code : 'TIMEOUT'} (${keluar ? keluar.ms : '-'}ms)`;
  }

  check('F28-V6', v6ok, v6detail);

  // Bersihkan: harness fase 02/03 memeriksa empty-state editor, dan halaman
  // Settings yang tertinggal terbuka membuat verify04 V2 gagal (tab bar tidak
  // dirender saat Settings menutupi editor) — pelajaran fase 08.
  await cdp.json(`
    CLI.tutupDiff();
    S.getState().setSettingsOpen(false);
    for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
    await S.getState().openWorkspace('D:/Zephyr');
    await wait(500);
    return JSON.stringify({ ok: true })
  `);
};

/** Hitung proses zephyr.exe lewat tasklist (tasklist /FI gagal di MSYS). */
function hitungProsesZephyr() {
  const r = spawnSync('cmd.exe', ['/c', 'tasklist /NH /FO CSV'], { encoding: 'utf8' });
  const baris = (r.stdout || '').split('\n').filter((l) => l.toLowerCase().includes('zephyr.exe'));
  return baris.length;
}
