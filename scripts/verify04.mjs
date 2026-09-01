// verify04.mjs — verifikasi V1..V11 fase 04 (Explorer + Workspace + Search)
// lewat CDP di app yang benar-benar berjalan.
//
// Pakai:  node scripts/verify04.mjs [port]
// Syarat: zephyr.exe berjalan dengan
//         WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"

import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.argv[2] ?? '9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WS = String.raw`D:\Zephyr\testfiles\ws-a`;
const WS_B = String.raw`D:\Zephyr\testfiles\ws-b`;
const ROOT = String.raw`D:\Zephyr`;

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

  /** Async di halaman + polling hasil (hindari "Promise was collected"). */
  async runAsync(body, timeoutMs = 30000) {
    const slot = `__ZV4_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const s = window.__ZEPHYR__.getState();
        const ex = window.__ZEPHYR_EX__.getState();
        ${body}
      })().then(
        (v) => { window[${JSON.stringify(slot)}] = { done: true, value: v ?? null, error: null }; },
        (e) => { window[${JSON.stringify(slot)}] = { done: true, value: null,
                  error: (e && (e.message || e.code)) ? JSON.stringify(e) : String(e) }; },
      );
      return 'started';
    })()`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await sleep(120);
      const st = JSON.parse(await this.eval(`JSON.stringify(window[${JSON.stringify(slot)}])`));
      if (st.done) {
        await this.eval(`(() => { delete window[${JSON.stringify(slot)}]; return 'x'; })()`);
        if (st.error) throw new Error(st.error);
        return st.value;
      }
      if (Date.now() > deadline) throw new Error(`timeout: ${body.slice(0, 70)}…`);
    }
  }

  close() {
    this.#ws.close();
  }
}

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(10)} ${detail}`);
};

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_EX__')) === 'undefined') {
    throw new Error('__ZEPHYR_EX__ tidak ada — reload halaman (dev build lama)');
  }

  // Bersihkan state.
  await cdp.eval(`(() => {
    const s = window.__ZEPHYR__.getState();
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    s.setActivity('explorer');
    if (!s.sidebarVisible) s.toggleSidebar();
    window.__ZEPHYR_ERRORS__.length = 0;
    return 'reset';
  })()`);
  await sleep(300);

  // ───────── V1: Open Folder -> tree muncul, node_modules disembunyikan ─────────
  await cdp.runAsync(`await s.openWorkspace(${JSON.stringify(ROOT)}); return 'ok';`);
  await sleep(1200);

  const treeInfo = JSON.parse(
    await cdp.eval(`(() => {
      const ex = window.__ZEPHYR_EX__.getState();
      const kids = ex.children[${JSON.stringify(ROOT)}] ?? [];
      const names = kids.map(k => k.name);
      const rows = [...document.querySelectorAll('.tree-row')].map(r => r.textContent.trim());
      return JSON.stringify({
        header: document.querySelector('.explorer-title')?.textContent ?? '',
        count: kids.length,
        hasNodeModules: names.includes('node_modules'),
        hasGit: names.includes('.git'),
        hasSrc: names.includes('src'),
        hasPkg: names.includes('package.json'),
        firstIsDir: kids[0]?.isDir === true,
        domRows: rows.length,
        sample: names.slice(0, 8),
      });
    })()`),
  );
  check(
    'V1',
    treeInfo.hasSrc &&
      treeInfo.hasPkg &&
      !treeInfo.hasNodeModules &&
      !treeInfo.hasGit &&
      treeInfo.firstIsDir &&
      treeInfo.domRows === treeInfo.count,
    `header="${treeInfo.header}" ${treeInfo.count} node, node_modules=${treeInfo.hasNodeModules} .git=${treeInfo.hasGit}, [${treeInfo.sample.join(', ')}]`,
  );

  // expand src -> anak muncul
  const SRC = path.join(ROOT, 'src');
  await cdp.runAsync(`await ex.toggleExpand(${JSON.stringify(SRC)}); return 'ok';`);
  await sleep(700);
  const expanded = JSON.parse(
    await cdp.eval(`(() => {
      const ex = window.__ZEPHYR_EX__.getState();
      const kids = ex.children[${JSON.stringify(SRC)}] ?? [];
      const row = document.querySelector('.tree-row[title=' + JSON.stringify(${JSON.stringify(SRC)}) + ']');
      return JSON.stringify({
        n: kids.length,
        names: kids.map(k => k.name),
        chevronOpen: document.querySelectorAll('.tree-chevron.is-open').length,
        rowExpanded: row?.getAttribute('aria-expanded'),
        domRows: document.querySelectorAll('.tree-row').length,
      });
    })()`),
  );
  check(
    'V1b',
    expanded.n > 0 &&
      expanded.names.includes('components') &&
      expanded.chevronOpen >= 1 &&
      expanded.rowExpanded === 'true',
    `expand src -> ${expanded.n} anak [${expanded.names.slice(0, 5).join(', ')}], chevron terbuka=${expanded.chevronOpen}, baris DOM total=${expanded.domRows}`,
  );

  // ───────── V2: klik file di tree -> tab terbuka ─────────
  const PKG = path.join(ROOT, 'package.json');
  const clicked = JSON.parse(
    await cdp.runAsync(`
      const before = s.tabs.length;
      // Cocokkan lewat atribut title (path lengkap) — textContent ikut
      // memuat glyph dari SVG ikon, jadi tidak bisa dibandingkan langsung.
      const target = document.querySelector('.tree-row[title=' + JSON.stringify(${JSON.stringify(PKG)}) + ']');
      if (!target) return JSON.stringify({ err: 'baris package.json tidak ada di DOM' });
      target.click();
      await new Promise(r => setTimeout(r, 900));
      const st = window.__ZEPHYR__.getState();
      const active = st.tabs.find(t => t.id === st.activeTabId);
      return JSON.stringify({ before, after: st.tabs.length, activeName: active?.name,
        activeLang: active?.lang,
        domActive: document.querySelector('.tab.is-active .tab-name')?.textContent,
        rowActive: !!document.querySelector('.tree-row.is-active') });
    `),
  );
  check(
    'V2',
    clicked.after === clicked.before + 1 &&
      clicked.activeName === 'package.json' &&
      clicked.domActive === 'package.json' &&
      clicked.rowActive,
    clicked.err ??
      `${clicked.before}->${clicked.after} tab, aktif="${clicked.activeName}" (${clicked.activeLang}), tabbar="${clicked.domActive}", baris tree disorot=${clicked.rowActive}`,
  );

  // ───────── V3: New File via context menu -> buka, isi, simpan ─────────
  const newFileName = `zephyr-v3-${Date.now()}.txt`;
  const newFilePath = `${ROOT}\\${newFileName}`;
  const v3 = JSON.parse(
    await cdp.runAsync(`
      ex.startInline({ kind: 'new-file', target: ${JSON.stringify(ROOT)}, initial: ${JSON.stringify(newFileName)} });
      await new Promise(r => setTimeout(r, 400));
      const inputExists = !!document.querySelector('.tree-input');
      await window.__ZEPHYR_EX__.getState().commitInline(${JSON.stringify(newFileName)});
      await new Promise(r => setTimeout(r, 900));
      const st = window.__ZEPHYR__.getState();
      const tab = st.tabs.find(t => t.name === ${JSON.stringify(newFileName)});
      const inTree = (window.__ZEPHYR_EX__.getState().children[${JSON.stringify(ROOT)}] ?? [])
        .some(n => n.name === ${JSON.stringify(newFileName)});
      return JSON.stringify({ inputExists, inTree, opened: !!tab, tabId: tab?.id });
    `),
  );
  check(
    'V3a',
    v3.inputExists && v3.inTree && v3.opened,
    `input inline=${v3.inputExists}, muncul di tree=${v3.inTree}, tab terbuka=${v3.opened}`,
  );

  // isi + simpan
  const marker = `ISI-V3-${Date.now()}`;
  await cdp.eval(`(() => {
    const v = window.__ZEPHYR_CM__();
    v.dispatch({ changes: { from: 0, insert: ${JSON.stringify(marker)} } });
    return 'typed';
  })()`);
  await sleep(600);
  const v3b = JSON.parse(
    await cdp.runAsync(`
      const t = s.tabs.find(x => x.name === ${JSON.stringify(newFileName)});
      window.__ZEPHYR_FLUSH__(t.id);
      const ok = await s.saveTab(t.id);
      const disk = await window.__ZEPHYR_FS__.read(${JSON.stringify(newFilePath)});
      return JSON.stringify({ ok, onDisk: disk.content.includes(${JSON.stringify(marker)}), enc: disk.detectedEncoding });
    `),
  );
  const diskCheck = fs.existsSync(newFilePath) && fs.readFileSync(newFilePath, 'utf8').includes(marker);
  check(
    'V3b',
    v3b.ok && v3b.onDisk && diskCheck,
    `simpan=${v3b.ok}, isi di disk (cek dari Node)=${diskCheck}, enc=${v3b.enc}`,
  );

  // ───────── V4: New Folder + Rename (F2) ─────────
  const folderName = `v4-folder-${Date.now()}`;
  const v4a = JSON.parse(
    await cdp.runAsync(`
      ex.startInline({ kind: 'new-folder', target: ${JSON.stringify(ROOT)}, initial: ${JSON.stringify(folderName)} });
      await new Promise(r => setTimeout(r, 300));
      await window.__ZEPHYR_EX__.getState().commitInline(${JSON.stringify(folderName)});
      await new Promise(r => setTimeout(r, 700));
      const node = (window.__ZEPHYR_EX__.getState().children[${JSON.stringify(ROOT)}] ?? [])
        .find(n => n.name === ${JSON.stringify(folderName)});
      return JSON.stringify({ ada: !!node, isDir: node?.isDir });
    `),
  );
  const folderOnDisk = fs.existsSync(path.join(ROOT, folderName));
  check(
    'V4a',
    v4a.ada && v4a.isDir && folderOnDisk,
    `folder di tree=${v4a.ada} isDir=${v4a.isDir}, ada di disk=${folderOnDisk}`,
  );

  // rename file V3 lewat jalur F2 (startInline kind=rename)
  const renamed = `zephyr-v4-renamed-${Date.now()}.txt`;
  const renamedPath = `${ROOT}\\${renamed}`;
  const v4b = JSON.parse(
    await cdp.runAsync(`
      ex.startInline({ kind: 'rename', target: ${JSON.stringify(newFilePath)}, initial: ${JSON.stringify(newFileName)} });
      await new Promise(r => setTimeout(r, 300));
      const hasInput = !!document.querySelector('.tree-input');
      await window.__ZEPHYR_EX__.getState().commitInline(${JSON.stringify(renamed)});
      await new Promise(r => setTimeout(r, 800));
      const st = window.__ZEPHYR__.getState();
      const kids = window.__ZEPHYR_EX__.getState().children[${JSON.stringify(ROOT)}] ?? [];
      return JSON.stringify({
        hasInput,
        lamaHilang: !kids.some(n => n.name === ${JSON.stringify(newFileName)}),
        baruAda: kids.some(n => n.name === ${JSON.stringify(renamed)}),
        tabIkut: st.tabs.some(t => t.name === ${JSON.stringify(renamed)}),
      });
    `),
  );
  const diskRenamed = fs.existsSync(renamedPath) && !fs.existsSync(newFilePath);
  check(
    'V4b',
    v4b.hasInput && v4b.lamaHilang && v4b.baruAda && v4b.tabIkut && diskRenamed,
    `input F2=${v4b.hasInput}, tree lama hilang=${v4b.lamaHilang} baru ada=${v4b.baruAda}, tab ikut=${v4b.tabIkut}, disk=${diskRenamed}`,
  );

  // ───────── V5: hapus file -> hilang dari tree & disk ─────────
  const v5 = JSON.parse(
    await cdp.runAsync(`
      await ex.deletePaths([${JSON.stringify(renamedPath)}]);
      await new Promise(r => setTimeout(r, 800));
      const kids = window.__ZEPHYR_EX__.getState().children[${JSON.stringify(ROOT)}] ?? [];
      const st = window.__ZEPHYR__.getState();
      return JSON.stringify({
        treeBersih: !kids.some(n => n.name === ${JSON.stringify(renamed)}),
        tabTertutup: !st.tabs.some(t => t.name === ${JSON.stringify(renamed)}),
      });
    `),
  );
  const goneOnDisk = !fs.existsSync(renamedPath);
  check(
    'V5',
    v5.treeBersih && v5.tabTertutup && goneOnDisk,
    `hilang dari tree=${v5.treeBersih}, tab ditutup=${v5.tabTertutup}, hilang di disk (cek Node)=${goneOnDisk}`,
  );

  // ───────── V6: drag file ke subfolder ─────────
  const moveSrcName = `v6-pindah-${Date.now()}.txt`;
  const moveSrc = path.join(ROOT, moveSrcName);
  fs.writeFileSync(moveSrc, 'file untuk uji drag & drop\n');
  const destDir = path.join(ROOT, folderName);
  await sleep(900); // biarkan watcher menangkap file baru

  const v6 = JSON.parse(
    await cdp.runAsync(`
      await s.openPath(${JSON.stringify(moveSrc)});
      await new Promise(r => setTimeout(r, 400));
      await window.__ZEPHYR_EX__.getState().movePath(${JSON.stringify(moveSrc)}, ${JSON.stringify(destDir)});
      await new Promise(r => setTimeout(r, 900));
      const st = window.__ZEPHYR__.getState();
      const tab = st.tabs.find(t => t.name === ${JSON.stringify(moveSrcName)});
      const err = window.__ZEPHYR_EX__.getState().explorerError;
      return JSON.stringify({ tabPath: tab?.path, err });
    `),
  );
  const movedTo = path.join(destDir, moveSrcName);
  const v6disk = fs.existsSync(movedTo) && !fs.existsSync(moveSrc);
  check(
    'V6a',
    v6disk && v6.tabPath?.toLowerCase() === movedTo.toLowerCase(),
    `file pindah di disk=${v6disk}, path tab ikut="${v6.tabPath}"`,
  );

  // proteksi: folder tidak boleh dipindah ke dalam dirinya sendiri
  const v6b = JSON.parse(
    await cdp.runAsync(`
      window.__ZEPHYR_EX__.setState({ explorerError: null });
      await window.__ZEPHYR_EX__.getState().movePath(${JSON.stringify(destDir)}, ${JSON.stringify(destDir)});
      await new Promise(r => setTimeout(r, 300));
      return JSON.stringify({ err: window.__ZEPHYR_EX__.getState().explorerError });
    `),
  );
  check(
    'V6b',
    typeof v6b.err === 'string' && v6b.err.includes('dirinya sendiri'),
    `proteksi self-move: "${v6b.err}"`,
  );

  // ───────── V7: watcher — file dibuat dari luar app ─────────
  const watchName = `v7-watcher-${Date.now()}.txt`;
  const watchPath = path.join(ROOT, watchName);
  await cdp.eval("(() => { window.__ZEPHYR_EX__.setState({ explorerError: null }); return 'x'; })()");
  const t0 = Date.now();
  fs.writeFileSync(watchPath, 'dibuat dari luar Zephyr (Node), watcher harus menangkapnya\n');

  let appeared = false;
  let elapsed = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    const found = await cdp.eval(
      `(window.__ZEPHYR_EX__.getState().children[${JSON.stringify(ROOT)}] ?? []).some(n => n.name === ${JSON.stringify(watchName)})`,
    );
    if (found) {
      appeared = true;
      elapsed = Date.now() - t0;
      break;
    }
  }
  check('V7', appeared && elapsed < 2000, `muncul di tree dalam ${elapsed}ms (batas 2000ms)`);
  fs.rmSync(watchPath, { force: true });

  // ───────── V8: search "import" -> klik hasil -> lompat baris ─────────
  const v8 = JSON.parse(
    await cdp.runAsync(
      `
      s.setActivity('search');
      window.__ZEPHYR_EX__.setState({ query: 'import', glob: '*.tsx', caseSensitive: false, regex: false });
      await window.__ZEPHYR_EX__.getState().runSearch();
      await new Promise(r => setTimeout(r, 400));
      const st = window.__ZEPHYR_EX__.getState();
      return JSON.stringify({
        hits: st.hits.length, files: new Set(st.hits.map(h => h.path)).size,
        scanned: st.filesScanned, truncated: st.truncated,
        first: st.hits[0] ? { name: st.hits[0].name, line: st.hits[0].line, col: st.hits[0].col,
                              preview: st.hits[0].preview.slice(0, 40) } : null,
        err: st.searchError,
      });
    `,
      45000,
    ),
  );
  check(
    'V8a',
    v8.hits > 0 && v8.files > 1 && !v8.err,
    `${v8.hits} hasil di ${v8.files} file (${v8.scanned} dipindai), pertama: ${v8.first?.name}:${v8.first?.line} "${v8.first?.preview}"`,
  );

  await sleep(500);
  const v8b = JSON.parse(
    await cdp.runAsync(`
      const st = window.__ZEPHYR_EX__.getState();
      const hit = st.hits.find(h => h.line > 1) ?? st.hits[0];
      await s.openPathAt(hit.path, hit.line, hit.col);
      await new Promise(r => setTimeout(r, 700));
      const view = window.__ZEPHYR_CM__();
      const pos = view.state.selection.main.head;
      const lineAt = view.state.doc.lineAt(pos);
      const active = window.__ZEPHYR__.getState();
      const tab = active.tabs.find(t => t.id === active.activeTabId);
      return JSON.stringify({
        want: hit.line, got: lineAt.number, wantCol: hit.col,
        gotCol: pos - lineAt.from + 1,
        tabName: tab?.name, hitName: hit.name,
        lineText: lineAt.text.slice(0, 40),
        cursorUi: document.querySelector('.statusbar')?.textContent?.match(/Ln \\d+, Col \\d+/)?.[0],
      });
    `),
  );
  check(
    'V8b',
    v8b.got === v8b.want && v8b.gotCol === v8b.wantCol && v8b.tabName === v8b.hitName,
    `lompat ke ${v8b.tabName}:${v8b.got}:${v8b.gotCol} (target ${v8b.want}:${v8b.wantCol}), StatusBar "${v8b.cursorUi}", baris="${v8b.lineText}"`,
  );

  // ───────── V9: replace all di satu file + undo di editor ─────────
  const repFile = path.join(ROOT, 'testfiles', `v9-replace-${Date.now()}.txt`);
  fs.writeFileSync(repFile, 'alpha satu\nbeta alpha\ngamma\nalpha akhir\n');
  await sleep(900);

  const v9 = JSON.parse(
    await cdp.runAsync(`
      s.setActivity('search');
      window.__ZEPHYR_EX__.setState({ query: 'alpha', replaceWith: 'OMEGA', glob: 'v9-replace-*.txt' });
      await window.__ZEPHYR_EX__.getState().runSearch();
      await new Promise(r => setTimeout(r, 400));
      const before = window.__ZEPHYR_EX__.getState().hits.length;

      // buka dulu supaya bisa diuji undo setelah replace
      await s.openPath(${JSON.stringify(repFile)});
      await new Promise(r => setTimeout(r, 500));

      await window.__ZEPHYR_EX__.getState().replaceInFileFromResults(${JSON.stringify(repFile)});
      await new Promise(r => setTimeout(r, 900));
      const after = window.__ZEPHYR_EX__.getState().hits.length;
      const st = window.__ZEPHYR__.getState();
      const tab = st.tabs.find(t => t.path && t.path.toLowerCase() === ${JSON.stringify(repFile.toLowerCase())});
      return JSON.stringify({ before, after, buffer: tab?.content, status: st.statusMessage });
    `),
  );
  const diskAfter = fs.readFileSync(repFile, 'utf8');
  check(
    'V9a',
    v9.before === 3 &&
      v9.after === 0 &&
      !diskAfter.includes('alpha') &&
      (diskAfter.match(/OMEGA/g) ?? []).length === 3,
    `hasil ${v9.before}->${v9.after}, disk: ${(diskAfter.match(/OMEGA/g) ?? []).length}x OMEGA, "alpha" tersisa=${diskAfter.includes('alpha')} | ${v9.status}`,
  );

  // undo di editor mengembalikan isi buffer (belum disimpan ke disk)
  const v9b = JSON.parse(
    await cdp.runAsync(`
      const st = window.__ZEPHYR__.getState();
      const tab = st.tabs.find(t => t.path && t.path.toLowerCase() === ${JSON.stringify(repFile.toLowerCase())});
      s.setActiveTab(tab.id);
      await new Promise(r => setTimeout(r, 700));
      const view = window.__ZEPHYR_CM__();
      const beforeUndo = view.state.doc.toString();
      window.__ZEPHYR_CMD__('undo');
      await new Promise(r => setTimeout(r, 400));
      const afterUndo = window.__ZEPHYR_CM__().state.doc.toString();
      return JSON.stringify({
        beforeHasOmega: beforeUndo.includes('OMEGA'),
        afterHasAlpha: afterUndo.includes('alpha'),
        changed: beforeUndo !== afterUndo,
      });
    `),
  );
  check(
    'V9b',
    v9b.beforeHasOmega && v9b.afterHasAlpha && v9b.changed,
    `buffer setelah replace punya OMEGA=${v9b.beforeHasOmega}, Ctrl+Z mengembalikan "alpha"=${v9b.afterHasAlpha}`,
  );
  fs.rmSync(repFile, { force: true });

  // ───────── V10: recent list ─────────
  const v10 = JSON.parse(
    await cdp.runAsync(`
      await s.openWorkspace(${JSON.stringify(WS)});
      await new Promise(r => setTimeout(r, 700));
      await s.openWorkspace(${JSON.stringify(WS_B)});
      await new Promise(r => setTimeout(r, 700));
      await s.closeWorkspace();
      await new Promise(r => setTimeout(r, 700));
      s.setActivity('explorer');
      await new Promise(r => setTimeout(r, 400));
      const st = window.__ZEPHYR__.getState();
      return JSON.stringify({
        workspace: st.workspace,
        recents: st.recents.map(r => r.path.split('\\\\').pop()),
        domRecent: document.querySelectorAll('[data-testid="recent-list"] .recent-item').length,
        emptyShown: !!document.querySelector('[data-testid="recent-list"]'),
      });
    `),
  );
  check(
    'V10',
    v10.workspace === null &&
      v10.emptyShown &&
      v10.domRecent >= 3 &&
      v10.recents[0] === 'ws-b' &&
      v10.recents[1] === 'ws-a',
    `no-workspace=${v10.workspace === null}, recent UI=${v10.domRecent} item: [${v10.recents.join(', ')}]`,
  );

  // ───────── V11: tanpa error konsol ─────────
  const errs = JSON.parse(await cdp.eval('JSON.stringify(window.__ZEPHYR_ERRORS__ ?? [])'));
  check('V11', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : 'tidak ada console error');

  // rapikan sisa uji
  fs.rmSync(path.join(ROOT, folderName), { recursive: true, force: true });

  cdp.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - fail.length}/${results.length} lulus ==`);
  if (fail.length) {
    console.log('GAGAL: ' + fail.map((f) => f.id).join(', '));
    process.exit(1);
  }
};

main().catch((e) => {
  console.error('verify04 error:', e.message);
  process.exit(2);
});
