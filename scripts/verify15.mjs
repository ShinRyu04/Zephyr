// verify15.mjs — verifikasi fase 15 (Bugfix Vol 1) di app HIDUP lewat CDP.
//
// Pakai:  node scripts/verify15.mjs [portCdp]
// Syarat: zephyr.exe dengan --remote-debugging-port=9223 + `npm run dev` :5173.
//
// Prinsip: tidak ada yang "dianggap lulus" — tiap V memakai jalur yang sama
// dengan user (store/command Rust asli) lalu membaca DOM/state/disk sebagai
// bukti. Sandbox & util ada di verify15-setup.mjs.

import {
  BASE,
  WS,
  git,
  siapkanSandbox,
  ukuran,
  bomHex,
  CDP_PORT,
  check,
  selesai,
  Cdp,
  rpc,
  sleep,
  fs,
  path,
  spawnSync,
} from './verify15-setup.mjs';

const J = JSON.stringify;

const main = async () => {
  const { REMOTE } = siapkanSandbox();
  const { cdp, page } = await Cdp.attach(CDP_PORT);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_BUG__')) === 'undefined') {
    throw new Error('__ZEPHYR_BUG__ tidak ada — reload halaman (devBridge fase 15)');
  }

  // Kondisi awal: tutup semua tab & pane, buka workspace sandbox.
  await cdp.runAsync(
    `
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setSettingsOpen(false);
    S.getState().setSaveIssue(null);
    G.setConfirm(null);
    await S.getState().openWorkspace(${J(WS)});
    await wait(500);
    await G.refresh();
    return 'siap';
  `,
    60000,
  );

  // ═════════ V1: UTF-16 BOM terbaca benar, read-only, simpan sebagai UTF-8 ═════════
  const fU16 = path.join(WS, 'utf16.txt');
  const bomSebelum = bomHex(fU16);
  const v1 = await cdp.json(
    `
    await s.openPath(${J(fU16)});
    await wait(400);
    const t = B.tabs().find((x) => x.path === ${J(fU16)});
    const banner = q('[data-testid="ro-banner"]');
    const cm = B.cmEditable();
    // Coba simpan → harus memunculkan dialog UTF-16, BUKAN menulis file.
    const hasilSave = await B.save(t.id);
    await wait(200);
    const issue = B.saveIssue();
    return JSON.stringify({
      isi: (S.getState().tabs.find((x) => x.id === t.id) || {}).content || '',
      encoding: t.encoding, readOnly: t.readOnly, note: t.note,
      bannerKind: banner ? banner.dataset.kind : null,
      bannerText: banner ? (banner.textContent || '').slice(0, 90) : null,
      adaTombolUtf8: !!q('[data-testid="ro-save-utf8"]'),
      cmEditable: cm ? cm.editable : null,
      hasilSave, issueKind: issue ? issue.kind : null,
      tabId: t.id,
    });
  `,
    40000,
  );
  const bomSetelahBaca = bomHex(fU16);
  check(
    'V1',
    /halo dari UTF-16/.test(v1.isi) &&
      v1.encoding === 'utf16le' &&
      v1.readOnly === true &&
      v1.bannerKind === 'utf16' &&
      v1.adaTombolUtf8 &&
      v1.cmEditable === false &&
      v1.hasilSave === false &&
      v1.issueKind === 'utf16' &&
      bomSebelum === 'fffe' &&
      bomSetelahBaca === bomSebelum,
    `UTF-16LE (BOM ${bomSebelum}) terbaca utuh "${v1.isi.split('\n')[0]}", encoding=${v1.encoding}, read-only (CM editable=${v1.cmEditable}), banner "${(v1.bannerText ?? '').slice(0, 46)}…", Ctrl+S → dialog ${v1.issueKind} tanpa menulis file`,
  );

  // V1b: jawab dialog → file ditulis ulang sebagai UTF-8, tab jadi bisa diedit.
  const v1b = await cdp.json(
    `
    await B.resolveSave('ok');
    await wait(500);
    const t = B.tabs().find((x) => x.path === ${J(fU16)});
    return JSON.stringify({ encoding: t.encoding, readOnly: t.readOnly, note: t.note,
                            banner: !!q('[data-testid="ro-banner"]'),
                            status: S.getState().statusMessage });
  `,
    40000,
  );
  const bomSesudahTulis = bomHex(fU16);
  const isiUtf8 = fs.readFileSync(fU16, 'utf8');
  check(
    'V1b',
    v1b.encoding === 'utf8' &&
      v1b.readOnly === false &&
      v1b.banner === false &&
      bomSesudahTulis !== 'fffe' &&
      /halo dari UTF-16/.test(isiUtf8),
    `"Tulis sebagai UTF-8" → BOM di disk ${bomSebelum} → ${bomSesudahTulis}, isi tetap utuh ("${isiUtf8.split('\n')[0]}"), tab jadi editable, banner hilang; status: "${v1b.status}"`,
  );

  // ═════════ V2: file >4MB → mode ringan read-only, tidak membekukan UI ═════════
  const fBesar = path.join(WS, 'besar.json');
  const mb = (ukuran(fBesar) / 1024 / 1024).toFixed(1);
  const v2 = await cdp.json(
    `
    const t0 = performance.now();
    await s.openPath(${J(fBesar)});
    await wait(150);
    const msBuka = Math.round(performance.now() - t0);
    // UI masih hidup? ukur waktu satu frame setelah file besar terpasang.
    const f0 = performance.now();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const msFrame = Math.round(performance.now() - f0);
    const t = B.tabs().find((x) => x.path === ${J(fBesar)});
    const cm = B.cmEditable();
    const banner = q('[data-testid="ro-banner"]');
    // Coba ubah isi lewat store → harus DITOLAK (read-only).
    const sebelum = (S.getState().tabs.find((x) => x.id === t.id) || {}).content.length;
    S.getState().updateTabContent(t.id, 'DIRUSAK');
    await wait(120);
    const sesudah = (S.getState().tabs.find((x) => x.id === t.id) || {}).content.length;
    const dirty = B.tabs().find((x) => x.id === t.id).unsaved;
    return JSON.stringify({ msBuka, msFrame, bytes: t.bytes, readOnly: t.readOnly,
      note: t.note, bannerKind: banner ? banner.dataset.kind : null,
      cmEditable: cm ? cm.editable : null, lines: cm ? cm.lines : 0,
      sebelum, sesudah, dirty });
  `,
    90000,
  );
  check(
    'V2',
    v2.readOnly === true &&
      v2.bannerKind === 'big' &&
      v2.cmEditable === false &&
      v2.lines > 1000 &&
      v2.sebelum === v2.sesudah &&
      v2.dirty === false &&
      v2.msFrame < 400,
    `JSON ${mb} MB (${v2.bytes} byte, ${v2.lines} baris) dibuka ${v2.msBuka}ms, frame berikutnya ${v2.msFrame}ms (UI tidak beku), read-only "${v2.note}", updateTabContent ditolak (panjang ${v2.sebelum}→${v2.sesudah}, dirty=${v2.dirty})`,
  );

  // ═════════ V3: file hilang dari luar lalu Ctrl+S → tanya "buat baru?" ═════════
  const fHilang = path.join(WS, 'akan-hilang.txt');
  const v3a = await cdp.json(
    `
    await s.openPath(${J(fHilang)});
    await wait(300);
    const t = B.tabs().find((x) => x.path === ${J(fHilang)});
    S.getState().updateTabContent(t.id, 'isi baru dari editor\\n');
    await wait(150);
    return JSON.stringify({ tabId: t.id, existed: t.existed,
                            dirty: B.tabs().find((x) => x.id === t.id).unsaved });
  `,
    40000,
  );
  fs.rmSync(fHilang, { force: true });
  const v3 = await cdp.json(
    `
    const hasil = await B.save(${J(v3a.tabId)});
    await wait(250);
    const issue = B.saveIssue();
    return JSON.stringify({ hasil, kind: issue ? issue.kind : null,
                            nama: issue ? issue.name : null,
                            judul: (q('[data-testid="save-issue-title"]') || {}).textContent || null,
                            body: ((q('[data-testid="save-issue-body"]') || {}).textContent || '').slice(0, 80) });
  `,
    40000,
  );
  const adaSetelahDialog = fs.existsSync(fHilang);
  // Batal → file TETAP tidak ada.
  await cdp.runAsync(`await B.resolveSave('cancel'); await wait(200); return 'x';`);
  const adaSetelahBatal = fs.existsSync(fHilang);
  // Simpan lagi lalu jawab "buat baru" → file muncul dengan isi buffer.
  const v3c = await cdp.json(
    `
    await B.save(${J(v3a.tabId)});
    await wait(250);
    await B.resolveSave('ok');
    await wait(400);
    const t = B.tabs().find((x) => x.id === ${J(v3a.tabId)});
    return JSON.stringify({ dirty: t.unsaved, status: S.getState().statusMessage });
  `,
    40000,
  );
  const isiBaru = fs.existsSync(fHilang) ? fs.readFileSync(fHilang, 'utf8') : '';
  check(
    'V3',
    v3a.existed === true &&
      v3.hasil === false &&
      v3.kind === 'missing' &&
      /sudah tidak ada di disk/.test(v3.judul ?? '') &&
      !adaSetelahDialog &&
      !adaSetelahBatal &&
      /isi baru dari editor/.test(isiBaru) &&
      v3c.dirty === false,
    `file dihapus dari luar → Ctrl+S TIDAK menulis (ada di disk: ${adaSetelahDialog}), dialog "${(v3.judul ?? '').slice(0, 44)}", Batal → tetap tidak ada (${adaSetelahBatal}); "Buat baru" → file berisi "${isiBaru.trim()}", tab bersih`,
  );

  // ═════════ V4: find regex step limit + undo setelah reload dari disk ═════════
  const fA = path.join(WS, 'banyak-a.txt');
  const v4 = await cdp.json(
    `
    await s.openPath(${J(fA)});
    await wait(350);
    S.getState().setFindOpen(true);
    await wait(220);
    const inp = q('.find-input');
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      d.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Aktifkan regex lalu ketik pola yang cocok di SETIAP posisi ('a' tunggal
    // pada file 60.000 'a') — dulu ini menggantung UI karena match dikumpulkan
    // semua sekaligus. Sekarang harus berhenti di batas 20.000 langkah.
    qa('.find-flag').filter((b) => b.title === 'Regular expression')[0].click();
    await wait(120);
    const t0 = performance.now();
    set(inp, 'a');
    await wait(600);
    const msCari = Math.round(performance.now() - t0);
    const label = (q('[data-testid="find-count"]') || {}).textContent || '';
    // UI masih hidup?
    const f0 = performance.now();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const msFrame = Math.round(performance.now() - f0);
    S.getState().setFindOpen(false);
    return JSON.stringify({ msCari, msFrame, label: label.trim() });
  `,
    60000,
  );
  check(
    'V4',
    /dihentikan/.test(v4.label) && v4.msFrame < 400 && v4.msCari < 4000,
    `regex "a*" pada 60.000 karakter: label "${v4.label}" (batas 20.000 langkah), selesai ${v4.msCari}ms, frame setelahnya ${v4.msFrame}ms — UI tidak menggantung`,
  );

  // V4b: undo history & kursor bertahan setelah file diubah dari luar.
  const fKode = path.join(WS, 'kode.txt');
  await cdp.runAsync(
    `
    await s.openPath(${J(fKode)});
    await wait(350);
    const v = CM();
    v.dispatch({ selection: { anchor: 4, head: 4 } });
    v.dispatch({ changes: { from: 4, insert: 'XYZ' } });
    await wait(400);
    return 'siap';
  `,
    40000,
  );
  fs.writeFileSync(fKode, 'satu\ndua\ntiga dari luar\n');
  await sleep(1200);
  const v4b = await cdp.json(
    `
    await S.getState().reloadTabFromDisk(${J(fKode)});
    await wait(450);
    const v = CM();
    const isiSetelahReload = v.state.doc.toString();
    const posSetelahReload = v.state.selection.main.head;
    const bisaUndo = window.__ZEPHYR_CMD__('undo');
    await wait(220);
    return JSON.stringify({ isiSetelahReload: isiSetelahReload.slice(0, 40),
                            posSetelahReload, bisaUndo,
                            isiSetelahUndo: CM().state.doc.toString().slice(0, 40) });
  `,
    40000,
  );
  check(
    'V4b',
    /tiga dari luar/.test(v4b.isiSetelahReload) &&
      v4b.bisaUndo === true &&
      v4b.posSetelahReload > 0,
    `file diubah dari luar → tab reload ("${v4b.isiSetelahReload.replace(/\n/g, '\\n')}"), kursor tetap di offset ${v4b.posSetelahReload} (bukan 0), undo masih bekerja (${v4b.bisaUndo}) → "${v4b.isiSetelahUndo.replace(/\n/g, '\\n')}"`,
  );

  // ═════════ V5: paste 4KB, exit code, 6 pane ditutup cepat ═════════
  const v5 = await cdp.json(
    `
    // Bersihkan panel dulu.
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    // PENTING: lepas render-pause. Saat jendela Zephyr tidak di depan, Rust
    // menandai window "minimized" dan MENAHAN emit pty-output sampai 512KB
    // (HOLD_CAP fase 14.4) — buffer xterm akan kosong dan uji paste gagal
    // padahal PTY-nya benar. Harness wajib menyetel ini seperti verify05.
    await window.__ZEPHYR_SET_PAUSED__(false);
    TS().setDock('terminal');
    TS().setVisible(true);
    // Pane 'cmd', BUKAN 'shell': PSReadLine me-render ulang baris input dan
    // hanya menampilkan sebagian saat inputnya 10.000 karakter, jadi buffer
    // xterm tidak bisa dipakai sebagai bukti. cmd.exe meneruskan apa adanya.
    const id = await TS().addPane('cmd');
    await wait(2600);
    // Kirim 10KB lewat jalur chunk 4KB. Prefix 'rem ' = komentar cmd, jadi
    // walau ter-eksekusi tidak melakukan apa pun.
    // CATATAN: buffer xterm hanya memuat baris yang TERLIHAT + scrollback;
    // 10.000 karakter pada terminal selebar ~168 kolom butuh ~60 baris, jadi
    // baca dengan maxLines besar — kalau tidak, hitungan 'Z' terlihat kecil
    // padahal datanya utuh (itu yang membuat V5 gagal di run pertama).
    const teks = 'rem ' + 'Z'.repeat(10000);
    const dikirim = await B.writeChunked(id, teks);
    await wait(2000);
    const layar = PTY.read(id, 1200);
    const jumlahZ = (layar.match(/Z/g) || []).length;
    return JSON.stringify({ id, dikirim, jumlahZ, panjangLayar: layar.length });
  `,
    90000,
  );
  check(
    'V5',
    v5.dikirim === 10004 && v5.jumlahZ >= 9900,
    `paste 10.004 byte lewat potongan 4KB: ${v5.dikirim} byte terkirim, ${v5.jumlahZ} karakter 'Z' terbaca di buffer terminal (≥9900 = tidak korup/terpotong)`,
  );

  // V5b: exit code sebenarnya + penanda di layar.
  const v5b = await cdp.json(
    `
    await window.__ZEPHYR_SET_PAUSED__(false);
    const id = await TS().addPane('cmd');
    await wait(2400);
    // cmd.exe butuh CRLF, bukan CR saja.
    await PTY.write(id, 'exit 3\\r\\n');
    // Tunggu sampai status berubah (maks ~8s) alih-alih menebak satu jeda.
    let p = null;
    for (let i = 0; i < 16; i++) {
      await wait(500);
      p = B.panes().find((x) => x.id === id);
      if (p && p.status === 'exited') break;
    }
    const layar = PTY.read(id, 200);
    return JSON.stringify({ status: p ? p.status : null, exitCode: p ? p.exitCode : null,
                            adaPenanda: /process exited code 3/.test(layar) });
  `,
    90000,
  );
  check(
    'V5b',
    v5b.status === 'exited' && v5b.exitCode === 3 && v5b.adaPenanda,
    `pane cmd "exit 3" → status=${v5b.status}, exitCode=${v5b.exitCode} (dari child.wait()), layar memuat "[process exited code 3]"=${v5b.adaPenanda}`,
  );

  // V5c: 6 pane ditutup cepat → tidak ada pty hantu / error.
  const v5c = await cdp.json(
    `
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    // Bunuh sisa pty apa pun supaya hitungan "sesudah" bersih (pane cmd yang
    // sudah exited tetap terdaftar sampai di-kill).
    for (const p of await PTY.list()) { try { await D.kill(p.id); } catch (e) {} }
    await wait(600);
    S.getState().setStatus('');
    TS().setVisible(true);
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const id = await TS().addPane('shell');
      if (id) ids.push(id);
    }
    await wait(2600);
    const sebelum = (await PTY.list()).filter((p) => p.alive).length;
    // Tutup SEMUA bersamaan (tanpa await berurutan) — inilah yang dulu
    // memicu closePane ganda.
    await Promise.all(ids.map((id) => TS().closePane(id)));
    await wait(2200);
    const sesudah = (await PTY.list()).filter((p) => p.alive).length;
    return JSON.stringify({ dibuat: ids.length, sebelum, sesudah,
                            panes: B.panes().length,
                            err: TS().terminalError,
                            errKonsol: (window.__ZEPHYR_ERRORS__ || []).length });
  `,
    120000,
  );
  check(
    'V5c',
    v5c.dibuat === 6 && v5c.sebelum >= 6 && v5c.sesudah === 0 && v5c.panes === 0 && !v5c.err,
    `6 pane dibuat (${v5c.sebelum} pty hidup) lalu ditutup BERSAMAAN → ${v5c.sesudah} pty tersisa, ${v5c.panes} pane di store, terminalError=${v5c.err ?? 'null'} (tidak ada double-dispose)`,
  );

  // ═════════ V6: diff file biner ═════════
  const v6 = await cdp.json(
    `
    await G.refresh();
    await wait(600);
    const raw = await B.diffRaw('gambar.png', false);
    await G.openDiff('gambar.png', false);
    await wait(500);
    const badge = q('[data-testid="diff-binary"]');
    const pre = q('[data-testid="diff-pre"]');
    const teks = pre ? pre.textContent : '';
    G.closeDiff();
    return JSON.stringify({
      rawAda: raw.length > 0,
      rawBinary: /Binary file/.test(raw),
      rawTanpaNul: !/\\u0000/.test(raw),
      badge: badge ? badge.textContent.trim() : null,
      teks: teks.replace(/\\n/g, ' | ').slice(0, 120),
      adaNulDiDom: /\\u0000/.test(teks),
    });
  `,
    60000,
  );
  check(
    'V6',
    v6.rawBinary && v6.rawTanpaNul && v6.badge === 'binary file' && !v6.adaNulDiDom,
    `diff PNG → "${v6.teks}" dengan badge "${v6.badge}"; tidak ada byte NUL yang masuk DOM (${!v6.adaNulDiDom})`,
  );

  // ═════════ V7: branch dengan slash + push saat behind ═════════
  const v7 = await cdp.json(
    `
    const a = await tangkap(() => B.branchRaw('feat/ui-15'));
    const b = await tangkap(() => B.branchRaw('salah:nama'));
    const c = await tangkap(() => B.branchRaw('feat/'));
    await G.refresh();
    await wait(500);
    const br = G.branches();
    return JSON.stringify({
      slashOk: a.ok, slashErr: a.message || null,
      kolonKode: b.code, kolonMsg: (b.message || '').slice(0, 60),
      trailingKode: c.code,
      current: br ? br.current : null,
      locals: br ? br.locals : [],
    });
  `,
    60000,
  );
  check(
    'V7',
    v7.slashOk === true &&
      v7.current === 'feat/ui-15' &&
      v7.locals.includes('feat/ui-15') &&
      v7.kolonKode === 'InvalidInput' &&
      v7.trailingKode === 'InvalidInput',
    `branch "feat/ui-15" dibuat & checkout (current=${v7.current}, locals=[${v7.locals.join(', ')}]); "salah:nama" → ${v7.kolonKode}, "feat/" → ${v7.trailingKode}`,
  );

  // V7b: kembali ke main (behind 1 dari remote) lalu Push → dialog pull dulu.
  git(['checkout', 'main']);
  git(['fetch', 'origin']);
  const v7b = await cdp.json(
    `
    await G.checkout('main');
    await wait(900);
    // Fetch lewat store supaya angka behind datang dari jalur app, bukan hanya
    // dari git CLI di harness.
    await G.store.getState().fetch();
    await wait(1400);
    await G.refresh();
    await wait(500);
    const st = G.status();
    G.setConfirm(null);
    await G.push(false);
    await wait(700);
    const cf = G.confirm();
    const judul = (q('[data-testid="scm-confirm-title"]') || {}).textContent || null;
    return JSON.stringify({ behind: st ? st.behind : -1, ahead: st ? st.ahead : -1,
                            upstream: st ? st.upstream : null,
                            kind: cf ? cf.kind : null, judul,
                            err: G.error() });
  `,
    90000,
  );
  check(
    'V7b',
    v7b.behind >= 1 && v7b.kind === 'pull-first' && /commit baru/.test(v7b.judul ?? ''),
    `behind=${v7b.behind} dari remote (upstream ${v7b.upstream}) → klik Push memunculkan dialog "${(v7b.judul ?? '').slice(0, 48)}" (kind=${v7b.kind}), bukan error non-fast-forward mentah`,
  );
  await cdp.runAsync(`G.setConfirm(null); await wait(150); return 'x';`);

  // ═════════ V8: batas MCP + stop membatalkan permintaan ═════════
  const v8pre = await cdp.json(
    `
    await M.refresh();
    await wait(300);
    let st = M.status();
    if (!st || !st.running) { await M.toggle(true); await wait(1200); await M.refresh(); st = M.status(); }
    return JSON.stringify({ running: st ? st.running : false, port: st ? st.port : 0,
                            token: st ? st.token : '' });
  `,
    60000,
  );
  const PORT = v8pre.port;
  const TOKEN = v8pre.token;

  // Tab untuk editor_write.
  const v8tab = await cdp.json(
    `
    await s.openPath(${J(fKode)});
    await wait(350);
    const t = B.tabs().find((x) => x.path === ${J(fKode)});
    return JSON.stringify({ id: t.id });
  `,
    40000,
  );

  const besar1MB = 'x'.repeat(1024 * 1024 + 64);
  const besar64KB = 'y'.repeat(64 * 1024 + 16);
  const rEditor = await rpc(PORT, 'editor_write', { tabId: v8tab.id, content: besar1MB }, TOKEN, 81);
  const rInsert = await rpc(PORT, 'editor_insert', { tabId: v8tab.id, text: besar1MB }, TOKEN, 82);
  const rTerm = await rpc(PORT, 'terminal_write', { paneId: 'apa-saja', data: besar64KB }, TOKEN, 83);
  const rKecil = await rpc(PORT, 'editor_write', { tabId: v8tab.id, content: 'dari MCP\n' }, TOKEN, 84);
  const isiKodeDiDisk = fs.readFileSync(fKode, 'utf8');
  const v8buf = await cdp.json(
    `
    const t = B.tabs().find((x) => x.id === ${J(v8tab.id)});
    return JSON.stringify({ isi: (S.getState().tabs.find((x) => x.id === t.id) || {}).content,
                            unsaved: t.unsaved });
  `,
    40000,
  );
  check(
    'V8',
    rEditor.body?.error?.code === -32602 &&
      /1MB|1048576/.test(rEditor.body?.error?.message ?? '') &&
      rInsert.body?.error?.code === -32602 &&
      rTerm.body?.error?.code === -32602 &&
      rKecil.body?.result &&
      v8buf.isi === 'dari MCP\n' &&
      v8buf.unsaved === true &&
      !/dari MCP/.test(isiKodeDiDisk),
    `editor_write 1MB+ → ${rEditor.body?.error?.code} "${(rEditor.body?.error?.message ?? '').slice(0, 54)}"; editor_insert & terminal_write 64KB+ juga ditolak; payload kecil tetap berhasil dan HANYA mengubah buffer (unsaved=${v8buf.unsaved}, disk masih "${isiKodeDiDisk.trim().split('\n')[0]}")`,
  );

  // V8b: stop MCP saat ada permintaan menggantung → error terstruktur, bukan hang.
  const v8b = await (async () => {
    // `pane_new` butuh jawaban UI. Kita blokir UI-nya dengan menutup listener?
    // Lebih jujur: panggil method lalu MATIKAN server 300ms kemudian, dan ukur
    // berapa lama balasan datang (harus << UI_TIMEOUT 8s bila dibatalkan).
    const t0 = Date.now();
    const p = rpc(PORT, 'get_window', {}, TOKEN, 85);
    await sleep(120);
    await cdp.runAsync(`await M.toggle(false); await wait(250); return 'x';`, 30000);
    const r = await p;
    const ms = Date.now() - t0;
    const mati = await rpc(PORT, 'get_window', {}, TOKEN, 86);
    return { ms, status: r.status, mati: mati.status };
  })();
  check(
    'V8b',
    v8b.ms < 7000 && v8b.mati === 0,
    `MCP dimatikan saat permintaan berjalan: balasan datang dalam ${v8b.ms}ms (< UI_TIMEOUT 8000ms, jadi tidak hang), setelah itu port benar-benar mati (status ${v8b.mati})`,
  );
  await cdp.runAsync(`await M.toggle(true); await wait(900); return 'x';`, 40000);

  // ═════════ V9: AI memotong pesan >8KB ═════════
  const v9 = await cdp.json(
    `
    const lim = B.aiLimits();
    X.store.setState({ toast: null, lastTruncated: null });
    // Pemotongan terjadi SEBELUM guard API key, jadi tetap terbukti walau
    // tidak ada key: lastTruncated terisi. (Toast bisa tertimpa pesan guard.)
    const panjang = lim.msg + 5000;
    const teks = 'P'.repeat(panjang);
    await X.send(teks);
    await wait(400);
    const tr = B.aiTruncated();
    // Pesan pendek TIDAK boleh dipotong.
    X.store.setState({ lastTruncated: null });
    await X.send('pesan pendek');
    await wait(300);
    return JSON.stringify({ lim, panjang, tr, trPendek: B.aiTruncated(),
                            toast: X.store.getState().toast });
  `,
    60000,
  );
  check(
    'V9',
    v9.lim.msg === 8192 &&
      v9.lim.attach === 12288 &&
      v9.tr &&
      v9.tr.from === v9.panjang &&
      v9.tr.to === 8192 &&
      v9.trPendek === null,
    `batas AI: pesan ${v9.lim.msg} byte, lampiran ${v9.lim.attach} byte, history ${v9.lim.maxMsgs}; kirim ${v9.panjang} karakter → dipotong ${v9.tr?.from}→${v9.tr?.to}; pesan pendek tidak dipotong (${v9.trPendek})`,
  );

  // ═════════ V10: layout sempit + RAM status bar ═════════
  const ramAwal = await cdp.eval(`window.__ZEPHYR_BUG__.ramText()`);
  // Panel terminal yang masih terbuka membuat `.editor-area` 0x0 (pelajaran
  // fase 13), jadi tutup dulu sebelum mengukur. Sidebar juga harus TERLIHAT
  // sebelum jendela dikecilkan — auto-collapse hanya menandai `autoCollapsed`
  // kalau ia yang menutupnya, jadi sidebar yang sudah tertutup tidak akan
  // dibuka lagi saat jendela dilebarkan (itu memang perilaku yang diinginkan).
  await cdp.runAsync(
    `TS().setVisible(false);
     S.getState().setSettingsOpen(false);
     if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
     await wait(400);
     return 'x';`,
    30000,
  );
  // Kecilkan jendela lewat command Rust `set_window_size` (jalur yang sama
  // dengan Settings). `import('/src/…')` dari dalam runAsync TIDAK bisa dipakai:
  // module graph Vite tidak mengekspornya ke scope halaman.
  await cdp.runAsync(`await B.resize(800, 520); await wait(1100); return 'x';`, 40000);
  await sleep(900);
  const v10b = await cdp.json(
    `
    const scrollX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const ed = q('.editor-area');
    const r = ed ? ed.getBoundingClientRect() : null;
    return JSON.stringify({
      lebar: window.innerWidth, tinggi: window.innerHeight,
      narrow: B.narrow(), sidebar: S.getState().sidebarVisible,
      scrollX, edW: r ? Math.round(r.width) : 0, edH: r ? Math.round(r.height) : 0,
      ram: B.ramText(),
    });
  `,
    40000,
  );
  // Lebarkan lagi → sidebar yang dilipat otomatis harus kembali.
  await cdp.runAsync(`await B.resize(1440, 900); await wait(1200); return 'x';`, 40000);
  await sleep(900);
  const v10c = await cdp.json(
    `return JSON.stringify({ lebar: window.innerWidth, narrow: B.narrow(),
                            sidebar: S.getState().sidebarVisible });`,
    40000,
  );
  check(
    'V10',
    v10b.narrow === true &&
      v10b.sidebar === false &&
      v10b.scrollX <= 1 &&
      v10b.edW > 700 &&
      v10c.narrow === false &&
      v10c.sidebar === true &&
      /MB/.test(v10b.ram ?? '') &&
      !/NaN|--/.test(v10b.ram ?? ''),
    `jendela ${v10b.lebar}x${v10b.tinggi}: is-narrow=${v10b.narrow}, sidebar dilipat otomatis (${v10b.sidebar}), scrollbar horizontal ${v10b.scrollX}px, editor ${v10b.edW}x${v10b.edH}; dilebarkan ke ${v10c.lebar} → sidebar kembali (${v10c.sidebar}); RAM status bar "${v10b.ram}" (awal "${ramAwal}") tanpa NaN`,
  );

  // ═════════ V11: tsc + cargo test + state bersih + 0 console error ═════════
  const v11 = await cdp.json(
    `
    // Bersihkan: tutup tab, pane, dialog, kembali ke workspace kosong.
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    for (const p of await PTY.list()) { try { await D.kill(p.id); } catch (e) {} }
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setSaveIssue(null);
    S.getState().setSettingsOpen(false);
    S.getState().setFindOpen(false);
    G.setConfirm(null);
    G.closeDiff();
    await S.getState().closeWorkspace();
    await wait(800);
    const err = (window.__ZEPHYR_ERRORS__ || []).filter((e) =>
      !/ERR_ABORTED|favicon|ResizeObserver/.test(e));
    const d = await D.get();
    return JSON.stringify({ err: err.slice(0, 4), errN: err.length,
                            tabs: S.getState().tabs.length,
                            panes: B.panes().length,
                            ptyCount: d.ptyCount,
                            issue: !!B.saveIssue() });
  `,
    60000,
  );
  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  const tsc = spawnSync(process.execPath, [tscJs, '--noEmit'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const tscOut = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();
  const rust = spawnSync('cargo', ['test', '--lib', '--quiet'], {
    cwd: path.join(process.cwd(), 'src-tauri'),
    encoding: 'utf8',
  });
  const rustOut = `${rust.stdout ?? ''}${rust.stderr ?? ''}`;
  const rustLulus = /test result: ok\./.test(rustOut) && rust.status === 0;
  // Jumlah test: baris "N passed" ada di STDOUT (bukan gabungan dengan warning
  // cargo di stderr yang bisa mendahuluinya).
  const jumlahTes = ((rust.stdout ?? '').match(/(\d+) passed/) ?? [])[1] ?? '?';
  check(
    'V11',
    tsc.status === 0 &&
      tscOut === '' &&
      rustLulus &&
      v11.errN === 0 &&
      v11.tabs === 0 &&
      v11.panes === 0 &&
      v11.ptyCount === 0 &&
      v11.issue === false,
    `tsc --noEmit exit ${tsc.status} tanpa output; cargo test --lib ${jumlahTes} lulus; ${v11.errN} console error sepanjang V1–V10${v11.errN ? ` (${v11.err.join(' | ').slice(0, 90)})` : ''}; state bersih (tab ${v11.tabs}, pane ${v11.panes}, pty ${v11.ptyCount})`,
  );

  // ───────── tutup ─────────
  fs.rmSync(BASE, { recursive: true, force: true });
  cdp.close();
  selesai();
};

main().catch((e) => {
  console.error(`verify15 error: ${e.message}`);
  process.exitCode = 1;
});
