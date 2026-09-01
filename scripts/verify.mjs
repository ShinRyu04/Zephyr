// verify.mjs — verifikasi otomatis Zephyr lewat CDP (WebView2 remote debugging).
// Membuktikan V1..V10 fase 03 (+ V4/V5/V6 fase 02) benar-benar jalan di app
// hidup, bukan sekadar "kode ada".
//
// Pakai:  node scripts/verify.mjs [port]
// Syarat: zephyr.exe berjalan dengan
//         WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//
// CATATAN CDP: `Runtime.evaluate` dengan awaitPromise:true sering gagal di
// WebView2 dengan "Promise was collected". Karena itu semua kerja async
// dijalankan lewat runAsync(): promise disimpan di window lalu di-poll.

import WebSocket from 'ws';

const PORT = process.argv[2] ?? '9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async connect(wsUrl) {
    const c = new Cdp();
    c.#ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    await new Promise((res, rej) => {
      c.#ws.once('open', res);
      c.#ws.once('error', rej);
    });
    c.#ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const p = c.#pending.get(msg.id);
      if (p) {
        c.#pending.delete(msg.id);
        p(msg);
      }
    });
    return c;
  }

  #send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((res) => {
      this.#pending.set(id, res);
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluasi ekspresi SINKRON (tanpa await). */
  async eval(expr) {
    const r = await this.#send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      userGesture: true,
    });
    if (r.error) throw new Error(`RPC: ${JSON.stringify(r.error)}`);
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
    }
    return r.result?.result?.value;
  }

  /**
   * Jalankan body async di halaman lalu tunggu hasilnya lewat polling.
   * `body` boleh memakai `s` (store state) dan wajib `return` sesuatu.
   */
  async runAsync(body, timeoutMs = 15000) {
    const slot = `__ZV_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const s = window.__ZEPHYR__.getState();
        ${body}
      })().then(
        (v) => { window[${JSON.stringify(slot)}] = { done: true, value: v ?? null, error: null }; },
        (e) => {
          window[${JSON.stringify(slot)}] = {
            done: true, value: null,
            error: (e && (e.message || e.code)) ? JSON.stringify(e) : String(e),
          };
        },
      );
      return 'started';
    })()`);

    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await sleep(120);
      const raw = await this.eval(`JSON.stringify(window[${JSON.stringify(slot)}])`);
      const st = JSON.parse(raw);
      if (st.done) {
        await this.eval(`(() => { delete window[${JSON.stringify(slot)}]; return 'cleaned'; })()`);
        if (st.error) throw new Error(st.error);
        return st.value;
      }
      if (Date.now() > deadline) throw new Error(`timeout menunggu: ${body.slice(0, 60)}…`);
    }
  }

  close() {
    this.#ws.close();
  }
}

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(18)} ${detail}`);
};

const TESTDIR = String.raw`D:\Zephyr\testfiles`;
const p = (name) => `${TESTDIR}\\${name}`;

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan — app berjalan?');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title} (${page.url})\n`);

  const bridge = await cdp.eval('typeof window.__ZEPHYR__');
  if (bridge !== 'function' && bridge !== 'object') {
    throw new Error(`window.__ZEPHYR__ tidak ada (typeof=${bridge}) — jalankan mode dev`);
  }

  // Kondisi awal bersih.
  await cdp.eval(`(() => {
    const s = window.__ZEPHYR__.getState();
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setActivity('explorer');
    if (!s.sidebarVisible) s.toggleSidebar();
    s.setFindOpen(false);
    window.__ZEPHYR_ERRORS__.length = 0;
    return 'reset';
  })()`);
  await sleep(300);

  // ───────── fase 02: shell ─────────
  const sh = JSON.parse(
    await cdp.eval(`JSON.stringify({
      activityButtons: document.querySelectorAll('.activitybar .ab-btn').length,
      statusbar: document.querySelector('.sb-brand')?.textContent ?? '',
      resizer: !!document.querySelector('.resizer'),
      // fase 05 mengganti placeholder .terminal-area dengan panel nyata
      terminalArea: !!document.querySelector('.term-area'),
      terminalResizer: !!document.querySelector('.term-resizer'),
      emptyState: !!document.querySelector('.empty-state'),
    })`),
  );
  check('F02-V4a', sh.activityButtons === 6, `ActivityBar ${sh.activityButtons} ikon`);
  check('F02-V6a', /Zephyr v\d+\.\d+\.\d+/.test(sh.statusbar), `StatusBar "${sh.statusbar}"`);
  check(
    'F02-V5a',
    sh.resizer && sh.terminalArea && sh.terminalResizer,
    `divider sidebar=${sh.resizer}, panel terminal (.term-area)=${sh.terminalArea}, divider terminal=${sh.terminalResizer}`,
  );
  check('F03-V0', sh.emptyState, 'empty state tampil saat tanpa tab');

  // klik tiap ikon (1..5 lalu 0 — klik ikon aktif menutup sidebar)
  const seen = [];
  for (const i of [1, 2, 3, 4, 5, 0]) {
    await cdp.eval(
      `(() => { document.querySelectorAll('.activitybar .ab-btn')[${i}].click(); return 'ok'; })()`,
    );
    await sleep(230);
    seen.push(
      JSON.parse(
        await cdp.eval(`JSON.stringify({
          title: document.querySelector('.side-title')?.textContent ?? '(kosong)',
          activity: window.__ZEPHYR__.getState().activity,
          visible: window.__ZEPHYR__.getState().sidebarVisible,
        })`),
      ),
    );
  }
  const uniqTitles = [...new Set(seen.map((x) => x.title))];
  check(
    'F02-V4b',
    uniqTitles.length === 6 && seen.every((x) => x.visible),
    seen.map((x) => `${x.activity}=${x.title}`).join(' > '),
  );

  // resize sidebar lewat store (drag sesungguhnya = pointer event)
  const resize = JSON.parse(
    await cdp.eval(`(() => {
      const s = window.__ZEPHYR__.getState();
      const before = s.sidebarWidth;
      s.setSidebarWidth(340);
      const mid = window.__ZEPHYR__.getState().sidebarWidth;
      s.setSidebarWidth(99);   // di bawah minimum -> harus di-clamp
      const clamped = window.__ZEPHYR__.getState().sidebarWidth;
      s.setSidebarWidth(before);
      return JSON.stringify({ before, mid, clamped });
    })()`),
  );
  check(
    'F02-V5b',
    resize.mid === 340 && resize.clamped === 180,
    `lebar ${resize.before}->340 ok, clamp minimum=${resize.clamped}`,
  );

  // RAM sampler (emit tiap 3 detik)
  await sleep(3600);
  const ram = await cdp.eval('window.__ZEPHYR__.getState().ramBytes');
  check('F02-V6b', ram > 0, `event ram-usage = ${(ram / 1048576).toFixed(1)} MB`);

  // ───────── V1: buka 3 bahasa + highlight ─────────
  for (const [file, lang] of [
    ['sample.tsx', 'tsx'],
    ['sample.py', 'python'],
    ['sample.json', 'json'],
  ]) {
    await cdp.runAsync(`await s.openPath(${JSON.stringify(p(file))}); return 'opened';`);
    await sleep(750);
    const info = JSON.parse(
      await cdp.eval(`(() => {
        const t = window.__ZEPHYR__.getState().tabs.find(x => x.name === ${JSON.stringify(file)});
        const colors = new Set();
        document.querySelectorAll('.cm-line span').forEach(el => colors.add(getComputedStyle(el).color));
        return JSON.stringify({
          lang: t?.lang, len: t?.content.length ?? 0,
          spans: document.querySelectorAll('.cm-line span').length,
          colors: colors.size,
          gutter: document.querySelectorAll('.cm-gutterElement').length,
        });
      })()`),
    );
    check(
      `F03-V1-${file}`,
      info.lang === lang && info.colors >= 3 && info.len > 0 && info.gutter > 0,
      `lang=${info.lang} warna_unik=${info.colors} span=${info.spans} gutter=${info.gutter} ${info.len}B`,
    );
  }

  // ───────── V7: multi tab ─────────
  await cdp.runAsync(`
    await s.openPath(${JSON.stringify(p('sample-bom.txt'))});
    await window.__ZEPHYR__.getState().openPath(${JSON.stringify(p('sample-ansi.txt'))});
    return 'ok';
  `);
  await sleep(600);
  const tabs = JSON.parse(
    await cdp.eval(`JSON.stringify({
      store: window.__ZEPHYR__.getState().tabs.length,
      dom: document.querySelectorAll('.tabbar .tab').length,
      names: [...document.querySelectorAll('.tabbar .tab .tab-name')].map(e => e.textContent),
    })`),
  );
  check(
    'F03-V7a',
    tabs.store === 5 && tabs.dom === 5,
    `${tabs.store} tab: ${tabs.names.join(', ')}`,
  );

  // pindah antar tab: konten editor ikut berubah
  const switching = [];
  for (const name of ['sample.py', 'sample.json', 'sample.tsx']) {
    await cdp.eval(`(() => {
      const s = window.__ZEPHYR__.getState();
      s.setActiveTab(s.tabs.find(t => t.name === ${JSON.stringify(name)}).id);
      return 'ok';
    })()`);
    await sleep(450);
    switching.push(
      JSON.parse(
        await cdp.eval(`JSON.stringify({
          activeTabName: document.querySelector('.tab.is-active .tab-name')?.textContent,
          firstLine: document.querySelector('.cm-line')?.textContent?.slice(0, 24),
          lang: window.__ZEPHYR__.getState().tabs.find(t => t.id === window.__ZEPHYR__.getState().activeTabId)?.lang,
        })`),
      ),
    );
  }
  const switchOk =
    switching.every((x, i) => x.activeTabName === ['sample.py', 'sample.json', 'sample.tsx'][i]) &&
    new Set(switching.map((x) => x.firstLine)).size === 3;
  check('F03-V7b', switchOk, switching.map((x) => `${x.activeTabName}:"${x.firstLine}"`).join(' | '));

  // ───────── V4: BOM + ANSI ─────────
  for (const [file, wantEnc, mustContain] of [
    ['sample-bom.txt', 'utf8-bom', 'BOM'],
    ['sample-ansi.txt', 'ansi', 'café'],
  ]) {
    const r = JSON.parse(
      await cdp.eval(`(() => {
        const t = window.__ZEPHYR__.getState().tabs.find(x => x.name === ${JSON.stringify(file)});
        const c = t?.content ?? '';
        return JSON.stringify({
          enc: t?.encoding, le: t?.lineEnding,
          hasText: c.includes(${JSON.stringify(mustContain)}),
          bom: c.startsWith('\\ufeff'), repl: c.includes('\\ufffd'),
          sample: c.slice(0, 34),
        });
      })()`),
    );
    check(
      `F03-V4-${file}`,
      r.enc === wantEnc && r.hasText && !r.bom && !r.repl,
      `enc=${r.enc} le=${r.le} "${r.sample.replace(/\r?\n/g, '\\n')}" bom_di_teks=${r.bom} rusak=${r.repl}`,
    );
  }

  // ───────── V2: dirty -> Ctrl+S -> disk berubah ─────────
  const marker = `ZEPHYR_VERIFY_${Date.now()}`;
  await cdp.eval(`(() => {
    const s = window.__ZEPHYR__.getState();
    s.setActiveTab(s.tabs.find(t => t.name === 'sample.tsx').id);
    return 'ok';
  })()`);
  await sleep(500);
  await cdp.eval(`(() => {
    const v = window.__ZEPHYR_CM__();
    v.dispatch({ changes: { from: 0, insert: ${JSON.stringify(`// ${marker}\n`)} } });
    return 'inserted';
  })()`);
  await sleep(650); // lewati debounce 300ms
  const dirty = JSON.parse(
    await cdp.eval(`(() => {
      const t = window.__ZEPHYR__.getState().tabs.find(x => x.name === 'sample.tsx');
      return JSON.stringify({
        unsaved: t.unsaved,
        dot: !!document.querySelector('.tab.is-active .tab-dot'),
        inBuffer: t.content.includes(${JSON.stringify(marker)}),
      });
    })()`),
  );
  check(
    'F03-V2a',
    dirty.unsaved && dirty.dot && dirty.inBuffer,
    `unsaved=${dirty.unsaved} titik_dirty=${dirty.dot} buffer_tersinkron=${dirty.inBuffer}`,
  );

  const savedRaw = await cdp.runAsync(`
    const t = s.tabs.find(x => x.name === 'sample.tsx');
    window.__ZEPHYR_FLUSH__(t.id);
    const ok = await s.saveTab(t.id);
    const after = window.__ZEPHYR__.getState().tabs.find(x => x.name === 'sample.tsx');
    const disk = await window.__ZEPHYR_FS__.read(after.path);
    return JSON.stringify({
      ok, unsaved: after.unsaved,
      onDisk: disk.content.includes(${JSON.stringify(marker)}),
      enc: disk.detectedEncoding, le: disk.lineEnding,
      dotGone: !document.querySelector('.tab.is-active .tab-dot'),
    });
  `);
  const saved = JSON.parse(savedRaw);
  check(
    'F03-V2b',
    saved.ok && !saved.unsaved && saved.onDisk && saved.dotGone,
    `simpan=${saved.ok} marker_di_disk=${saved.onDisk} titik_hilang=${saved.dotGone} enc=${saved.enc} le=${saved.le}`,
  );

  // ───────── V3: undo / redo ─────────
  const ur = JSON.parse(
    await cdp.eval(`(() => {
      const v = window.__ZEPHYR_CM__();
      const before = v.state.doc.toString();
      window.__ZEPHYR_CMD__('undo');
      const afterUndo = v.state.doc.toString();
      window.__ZEPHYR_CMD__('redo');
      const afterRedo = v.state.doc.toString();
      return JSON.stringify({
        undoChanged: afterUndo !== before,
        undoRemovedMarker: !afterUndo.includes(${JSON.stringify(marker)}),
        redoRestored: afterRedo === before,
      });
    })()`),
  );
  check(
    'F03-V3',
    ur.undoChanged && ur.undoRemovedMarker && ur.redoRestored,
    `undo_ubah=${ur.undoChanged} marker_hilang=${ur.undoRemovedMarker} redo_pulih=${ur.redoRestored}`,
  );

  // ───────── V6: find & replace ─────────
  await cdp.eval("(() => { window.__ZEPHYR__.getState().setFindOpen(true); return 'ok'; })()");
  await sleep(450);
  const setInput = (idx, val) => `(() => {
    const inputs = document.querySelectorAll('.find-input');
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    d.set.call(inputs[${idx}], ${JSON.stringify(val)});
    inputs[${idx}].dispatchEvent(new Event('input', { bubbles: true }));
    return 'set';
  })()`;

  await cdp.eval(setInput(0, 'const'));
  await sleep(600);
  const findState = JSON.parse(
    await cdp.eval(`JSON.stringify({
      countText: document.querySelector('.find-count')?.textContent ?? '',
      occurrences: (window.__ZEPHYR_CM__().state.doc.toString().match(/const/g) ?? []).length,
      highlighted: document.querySelectorAll('.cm-searchMatch, .cm-selectionMatch').length,
    })`),
  );
  check(
    'F03-V6a',
    parseInt(findState.countText) === findState.occurrences && findState.occurrences > 0,
    `UI "${findState.countText}" vs dokumen ${findState.occurrences}, highlight=${findState.highlighted}`,
  );

  // next/prev memindahkan selection
  const nav = JSON.parse(
    await cdp.eval(`(() => {
      const v = window.__ZEPHYR_CM__();
      const btns = [...document.querySelectorAll('.find-btn')];
      const next = btns.find(b => b.title.includes('Berikutnya'));
      const posBefore = v.state.selection.main.from;
      next.click(); const p1 = window.__ZEPHYR_CM__().state.selection.main.from;
      next.click(); const p2 = window.__ZEPHYR_CM__().state.selection.main.from;
      return JSON.stringify({ posBefore, p1, p2, moved: p1 !== p2 });
    })()`),
  );
  check('F03-V6b', nav.moved, `next: ${nav.posBefore} -> ${nav.p1} -> ${nav.p2}`);

  // replace all — buka baris replace hanya bila belum terbuka
  // (state showReplace di FindBar bertahan antar buka/tutup panel).
  await cdp.eval(`(() => {
    if (document.querySelectorAll('.find-input').length < 2) {
      document.querySelector('.find-toggle').click();
    }
    return 'ok';
  })()`);
  await sleep(400);
  const inputCount = await cdp.eval("document.querySelectorAll('.find-input').length");
  if (inputCount < 2) throw new Error('baris replace tidak terbuka');
  await cdp.eval(setInput(1, 'CONSTX'));
  await sleep(450);
  await cdp.eval(`(() => {
    [...document.querySelectorAll('.find-btn-wide')].find(b => b.textContent.includes('semua')).click();
    return 'replaced';
  })()`);
  await sleep(700);
  const rep = JSON.parse(
    await cdp.eval(`(() => {
      const doc = window.__ZEPHYR_CM__().state.doc.toString();
      return JSON.stringify({
        sisa: (doc.match(/\\bconst\\b/g) ?? []).length,
        baru: (doc.match(/CONSTX/g) ?? []).length,
      });
    })()`),
  );
  check(
    'F03-V6c',
    rep.sisa === 0 && rep.baru === findState.occurrences,
    `"const" sisa=${rep.sisa}, jadi CONSTX=${rep.baru} (harap ${findState.occurrences})`,
  );

  // tutup find, undo semua perubahan uji (tidak disimpan)
  await cdp.eval(`(() => {
    window.__ZEPHYR__.getState().setFindOpen(false);
    for (let i = 0; i < 60; i++) window.__ZEPHYR_CMD__('undo');
    return 'undone';
  })()`);
  await sleep(500);

  // ───────── V5: dialog 3 pilihan ─────────
  await cdp.eval(`(() => {
    const v = window.__ZEPHYR_CM__();
    v.dispatch({ changes: { from: 0, insert: '// kotor lagi\\n' } });
    return 'dirty';
  })()`);
  await sleep(650);
  await cdp.eval(`(() => {
    const s = window.__ZEPHYR__.getState();
    const t = s.tabs.find(x => x.name === 'sample.tsx');
    window.__ZEPHYR_FLUSH__(t.id);
    s.requestCloseTab(t.id);
    return 'requested';
  })()`);
  await sleep(500);
  const dlg = JSON.parse(
    await cdp.eval(`JSON.stringify({
      modal: !!document.querySelector('.modal[role="dialog"]'),
      title: document.querySelector('.modal-title')?.textContent ?? '',
      btns: [...document.querySelectorAll('.modal-actions .btn')].map(b => b.textContent.trim()),
    })`),
  );
  check(
    'F03-V5a',
    dlg.modal && dlg.btns.length === 3 && dlg.btns.includes('Batal'),
    `"${dlg.title}" tombol=[${dlg.btns.join(', ')}]`,
  );

  // Batal -> tab tetap terbuka & tetap kotor
  await cdp.eval(`(() => {
    [...document.querySelectorAll('.modal-actions .btn')].find(b => b.textContent.includes('Batal')).click();
    return 'cancel';
  })()`);
  await sleep(500);
  const afterCancel = JSON.parse(
    await cdp.eval(`(() => {
      const s = window.__ZEPHYR__.getState();
      const t = s.tabs.find(x => x.name === 'sample.tsx');
      return JSON.stringify({ ada: !!t, unsaved: t?.unsaved, modal: !!document.querySelector('.modal') });
    })()`),
  );
  check(
    'F03-V5b',
    afterCancel.ada && afterCancel.unsaved && !afterCancel.modal,
    `Batal -> tab ada=${afterCancel.ada} masih_kotor=${afterCancel.unsaved} dialog_tutup=${!afterCancel.modal}`,
  );

  // "Jangan Simpan" -> tab tertutup, disk TIDAK berubah
  const beforeDiscard = await cdp.runAsync(`
    const t = s.tabs.find(x => x.name === 'sample.tsx');
    const disk = await window.__ZEPHYR_FS__.read(t.path);
    return disk.content.length + '';
  `);
  await cdp.eval(`(() => {
    const s = window.__ZEPHYR__.getState();
    s.requestCloseTab(s.tabs.find(x => x.name === 'sample.tsx').id);
    return 'req';
  })()`);
  await sleep(450);
  await cdp.eval(`(() => {
    [...document.querySelectorAll('.modal-actions .btn')].find(b => b.textContent.includes('Jangan')).click();
    return 'discard';
  })()`);
  await sleep(600);
  const afterDiscard = await cdp.runAsync(`
    const disk = await window.__ZEPHYR_FS__.read(${JSON.stringify(p('sample.tsx'))});
    return JSON.stringify({
      closed: !window.__ZEPHYR__.getState().tabs.some(t => t.name === 'sample.tsx'),
      sameSize: disk.content.length + '' === ${JSON.stringify(beforeDiscard)},
      size: disk.content.length,
    });
  `);
  const ad = JSON.parse(afterDiscard);
  check(
    'F03-V5c',
    ad.closed && ad.sameSize,
    `Jangan Simpan -> tab tertutup=${ad.closed} disk_tak_berubah=${ad.sameSize} (${ad.size}B)`,
  );

  // ───────── V9: drop file (payload event Tauri) ─────────
  const dropped = await cdp.runAsync(
    `
    const before = s.tabs.length;
    // Simulasikan handler drop yang sama seperti onDragDropEvent di App.tsx
    await s.openPath(${JSON.stringify(p('drop-test.txt'))});
    const after = window.__ZEPHYR__.getState();
    return JSON.stringify({
      before, after: after.tabs.length,
      opened: after.tabs.some(t => t.name === 'drop-test.txt'),
      lang: after.tabs.find(t => t.name === 'drop-test.txt')?.lang,
    });
  `,
  );
  const dp = JSON.parse(dropped);
  check(
    'F03-V9',
    dp.opened && dp.after === dp.before + 1,
    `openPath (jalur yang dipakai handler drop): ${dp.before}->${dp.after} tab, lang=${dp.lang}`,
  );

  // ───────── V8: session tersimpan ─────────
  const sess = JSON.parse(
    await cdp.runAsync(`
      await s.persistSession();
      const list = await window.__ZEPHYR_FS__.sessionLoad();
      return JSON.stringify({ n: list.length, files: list.map(x => x.path.split('\\\\').pop()) });
    `),
  );
  check(
    'F03-V8',
    sess.n >= 4 && sess.files.includes('sample.py'),
    `session.json: ${sess.n} file (${sess.files.join(', ')})`,
  );

  // ───────── V10: tanpa error konsol ─────────
  const errs = JSON.parse(await cdp.eval('JSON.stringify(window.__ZEPHYR_ERRORS__ ?? [])'));
  check('F03-V10', errs.length === 0, errs.length ? errs.join(' | ') : 'tidak ada console error');

  cdp.close();

  const fail = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - fail.length}/${results.length} lulus ==`);
  if (fail.length) {
    console.log('GAGAL: ' + fail.map((f) => f.id).join(', '));
    process.exit(1);
  }
};

main().catch((e) => {
  console.error('verify error:', e.message);
  process.exit(2);
});
