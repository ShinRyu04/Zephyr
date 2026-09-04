// verify12.mjs — verifikasi V1..V11 fase 12 (Command Palette + Browser Pane)
//
// Pakai:  node scripts/verify12.mjs [portCdp]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup di :5173
//
// Prinsip: palette diuji lewat DOM sungguhan (keydown di input, klik baris),
// bukan hanya memanggil store. Pane browser dibuktikan dengan server uji lokal
// di port 8099 (port 8080 TIDAK bisa dipakai di mesin ini — WinError 10013)
// yang mencatat request masuk, plus satu endpoint yang mengirim
// X-Frame-Options: DENY untuk membuktikan jalur "situs menolak embed".

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const CDP_PORT = process.argv[2] ?? '9223';
const TEST_PORT = 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── CDP ─────────────────────────

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

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((res) => {
      this.#pending.set(id, res);
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
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

  /** Async di halaman + polling (WebView2 sering membuang promise). */
  async runAsync(body, timeoutMs = 60000) {
    const slot = `__ZV12_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const TS = () => window.__ZEPHYR_TERM__.getState();
        const CP = window.__ZEPHYR_CP__;
        const CPS = () => window.__ZEPHYR_CP__.store.getState();
        const M = window.__ZEPHYR_MCP__;
        const MS = () => window.__ZEPHYR_MCP__.store.getState();
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        /** Tekan tombol sungguhan di window (menguji handler global App.tsx). */
        const tekan = (key, mods = {}) => {
          const ev = new KeyboardEvent('keydown', {
            key, bubbles: true, cancelable: true,
            ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt,
          });
          (mods.target ?? window).dispatchEvent(ev);
          return ev.defaultPrevented;
        };
        /** Ketik di input palette lewat setter asli (React onChange). */
        const ketik = async (text) => {
          const el = q('[data-testid="cp-input"]');
          if (!el) throw new Error('input palette tidak ada');
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value').set;
          setter.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(180);
          return el;
        };
        /** Kirim keydown ke input palette (Arrow/Enter/Esc ditangani modal). */
        const keyInput = async (key) => {
          const el = q('[data-testid="cp-input"]');
          if (!el) throw new Error('input palette tidak ada');
          el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
          await wait(160);
        };
        const barisAktif = () => q('[data-testid="cp-row"][data-active="1"]');
        ${body}
      })().then(
        (v) => { window[${JSON.stringify(slot)}] = { done: true, value: v ?? null, error: null }; },
        (e) => { window[${JSON.stringify(slot)}] = { done: true, value: null,
                  error: (e && e.stack) ? String(e.stack).slice(0, 400)
                       : (e && (e.message || e.code)) ? JSON.stringify(e) : String(e) }; },
      );
      return 'started';
    })()`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await sleep(150);
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
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${detail}`);
};

// ───────────────── HTTP ke server MCP (simulasi AI CLI) ─────────────────

/** POST JSON-RPC ke server MCP. UA disetel agar terlihat sebagai CLI tertentu. */
async function rpc(port, method, params = {}, token = null, id = 1, ua = 'opencode/1.2') {
  const headers = { 'content-type': 'application/json', 'user-agent': ua };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    // Port mati = fetch melempar; jadikan status 0 agar bisa diuji.
    return { status: 0, body: null };
  }
}

/** GET dengan User-Agent yang bisa diatur (untuk menguji label "MCP connected"). */
async function getJson(url, token = null, ua = 'opencode/1.2') {
  const headers = { 'user-agent': ua };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}

// ─────────────── server uji lokal (bukti pane browser) ───────────────

/** Server yang mencatat request masuk + endpoint yang MENOLAK embed. */
function startTestServer() {
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    if ((req.url ?? '').startsWith('/blokir')) {
      // Ini yang membuktikan jalur "situs menolak embed" tanpa internet.
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'x-frame-options': 'DENY',
      });
      res.end('<html><body>tidak boleh di-embed</body></html>');
      return;
    }
    if ((req.url ?? '').startsWith('/halaman2')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>HALAMAN-DUA</h1></body></html>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>ZEPHYR-BROWSER-PANE-OK</h1></body></html>');
  });
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(TEST_PORT, '127.0.0.1', () => resolve({ srv, hits }));
  });
}

// ───────────────────────── main ─────────────────────────

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_CP__')) === 'undefined') {
    throw new Error('__ZEPHYR_CP__ tidak ada — reload halaman (devBridge fase 12)');
  }

  const { srv, hits } = await startTestServer();
  const SANDBOX = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp', `zephyr-cp-${process.pid}`);
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(path.join(SANDBOX, 'src', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(SANDBOX, 'src', 'lib', 'targetPalette.ts'), '// file target uji V2\n');
  fs.writeFileSync(path.join(SANDBOX, 'README.md'), '# sandbox palette\n');
  fs.writeFileSync(path.join(SANDBOX, 'src', 'main.tsx'), '// entry\n');

  // Kondisi awal bersih. Workspace = repo Zephyr sendiri supaya command Git
  // benar-benar tersedia (`git.commit` disembunyikan bila bukan repo).
  await cdp.runAsync(
    `
    CP.close();
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    s.setSettingsOpen(false);
    s.setActivity('explorer');
    M.setToast(null);
    M.clearLog();
    await s.openWorkspace(${JSON.stringify(process.cwd())});
    await wait(800);
    await window.__ZEPHYR_GIT__.refresh();
    await wait(400);
    window.__ZEPHYR_ERRORS__.length = 0;
    return JSON.stringify({ repo: !!window.__ZEPHYR_GIT__.status()?.isRepo });
  `,
    90000,
  );

  // ───────── V1: Ctrl+Shift+P → palette; "git commit" → Enter → panel SCM ─────────
  const v1 = JSON.parse(
    await cdp.runAsync(`
      const dicegah = tekan('P', { ctrl: true, shift: true });
      await wait(350);
      const modalAda = !!q('[data-testid="cp-modal"]');
      const mode = q('[data-testid="cp-modal"]')?.dataset.mode ?? null;
      const fokus = document.activeElement === q('[data-testid="cp-input"]');
      await ketik('git commit');
      const baris = qa('[data-testid="cp-row"]').map(e => e.textContent?.trim() ?? '');
      const atas = barisAktif()?.dataset.cpId ?? null;
      await keyInput('Enter');
      await wait(500);
      return JSON.stringify({
        dicegah, modalAda, mode, fokus, baris: baris.slice(0, 4), atas,
        tertutup: !q('[data-testid="cp-modal"]'),
        activity: S.getState().activity,
        sidebar: S.getState().sidebarVisible,
        panelScm: !!q('[data-testid="scm-panel"]'),
        lastRun: CP.lastRun()?.id ?? null,
      });
    `),
  );
  check(
    'V1',
    v1.dicegah === true &&
      v1.modalAda === true &&
      v1.mode === 'command' &&
      v1.fokus === true &&
      v1.atas === 'git.commit' &&
      v1.tertutup === true &&
      v1.activity === 'scm' &&
      v1.panelScm === true &&
      v1.lastRun === 'git.commit',
    `Ctrl+Shift+P membuka palette (mode command, input langsung fokus); ketik "git commit" → baris teratas = git.commit (hasil: ${JSON.stringify(v1.baris[0])}); Enter menutup modal & membuka panel Source Control (activity=${v1.activity}, panel ter-mount)`,
  );

  // ───────── V2: Ctrl+P → daftar file workspace → pilih → tab terbuka ─────────
  const v2 = JSON.parse(
    await cdp.runAsync(`
      await s.openWorkspace(${JSON.stringify(SANDBOX)});
      await wait(600);
      const t0 = Date.now();
      const dicegah = tekan('p', { ctrl: true });
      // Daftar file dimuat dari Rust; tunggu sampai selesai.
      for (let i = 0; i < 40 && CPS().loadingFiles; i++) await wait(80);
      await wait(200);
      const ms = Date.now() - t0;
      const mode = q('[data-testid="cp-modal"]')?.dataset.mode ?? null;
      const total = CP.files();
      await ketik('targetpal');
      const baris = qa('[data-testid="cp-row"]').map(e => ({
        label: e.querySelector('.cp-label')?.textContent ?? '',
        detail: e.querySelector('.cp-detail')?.textContent ?? '',
      }));
      const atas = barisAktif()?.dataset.cpId ?? null;
      await keyInput('Enter');
      await wait(700);
      const tab = S.getState().tabs.find(t => (t.name ?? '').includes('targetPalette'));
      return JSON.stringify({
        dicegah, mode, ms, total, baris: baris.slice(0, 3), atas,
        tabAda: !!tab, tabPath: tab?.path ?? null,
        aktif: S.getState().activeTabId === tab?.id,
        tertutup: !q('[data-testid="cp-modal"]'),
      });
    `),
  );
  check(
    'V2',
    v2.dicegah === true &&
      v2.mode === 'file' &&
      v2.total >= 3 &&
      v2.baris[0]?.label === 'targetPalette.ts' &&
      v2.tabAda === true &&
      v2.aktif === true &&
      v2.tertutup === true &&
      v2.ms < 4000,
    `Ctrl+P → mode file, ${v2.total} file workspace dimuat dalam ${v2.ms}ms; ketik "targetpal" → hasil teratas "${v2.baris[0]?.label}" (${v2.baris[0]?.detail}); Enter membuka tab & memfokuskannya`,
  );

  // ───────── V3: Arrow navigasi + Esc ─────────
  const v3 = JSON.parse(
    await cdp.runAsync(`
      tekan('P', { ctrl: true, shift: true });
      await wait(300);
      await ketik('terminal');
      const n = qa('[data-testid="cp-row"]').length;
      const i0 = CP.index();
      const id0 = barisAktif()?.dataset.cpId ?? null;
      await keyInput('ArrowDown');
      const i1 = CP.index();
      const id1 = barisAktif()?.dataset.cpId ?? null;
      await keyInput('ArrowDown');
      const i2 = CP.index();
      await keyInput('ArrowUp');
      const i3 = CP.index();
      // Melingkar: dari 0 ke atas harus lompat ke item terakhir.
      CP.store.getState().setIndex(0);
      await wait(120);
      await keyInput('ArrowUp');
      const iWrap = CP.index();
      const dicegah = (() => {
        const el = q('[data-testid="cp-input"]');
        const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      })();
      await wait(300);
      return JSON.stringify({
        n, i0, i1, i2, i3, iWrap, id0, id1, dicegah,
        tertutup: !q('[data-testid="cp-modal"]'),
        queryBersih: CPS().query === '',
      });
    `),
  );
  check(
    'V3',
    v3.n >= 4 &&
      v3.i0 === 0 &&
      v3.i1 === 1 &&
      v3.i2 === 2 &&
      v3.i3 === 1 &&
      v3.iWrap === v3.n - 1 &&
      v3.id0 !== v3.id1 &&
      v3.dicegah === true &&
      v3.tertutup === true &&
      v3.queryBersih === true,
    `${v3.n} hasil untuk "terminal": ArrowDown 0→1→2, ArrowUp →1, dari index 0 ArrowUp melingkar ke ${v3.iWrap}; baris aktif ikut pindah (${v3.id0} → ${v3.id1}); Esc menutup modal & mengosongkan query`,
  );

  // ───────── V4: semua shortcut terdaftar & tanpa konflik ─────────
  const v4 = JSON.parse(
    await cdp.runAsync(`
      tekan('P', { ctrl: true, shift: true });
      await wait(280);
      await ketik('keyboard shortcut');
      const idHelp = barisAktif()?.dataset.cpId ?? null;
      await keyInput('Enter');
      await wait(600);
      const tabel = CP.shortcutTable();
      const wajib = ['Ctrl+Shift+P','Ctrl+P','Ctrl+Shift+E','Ctrl+Shift+F','Ctrl+Shift+G',
                     'Ctrl+Shift+T','Ctrl+\`','Ctrl+N','Ctrl+O','Ctrl+S','Ctrl+W',
                     'Ctrl+Tab','Ctrl+B','Ctrl+J','Ctrl+=','Ctrl+-','Ctrl+0'];
      const ada = tabel.rows.map(r => r.binding);
      const hilang = wajib.filter(b => !ada.includes(b));
      // Section Shortcuts harus benar-benar terbuka (bukti UI).
      const barisUi = qa('[data-sc-row]').length;
      return JSON.stringify({
        idHelp, hilang, konflik: tabel.conflicts,
        total: tabel.rows.length, barisUi,
        section: window.__ZEPHYR_SET__.ui.getState().section,
        settingsOpen: S.getState().settingsOpen,
      });
    `),
  );
  check(
    'V4',
    v4.idHelp === 'shortcut.list' &&
      v4.hilang.length === 0 &&
      v4.konflik.length === 0 &&
      v4.total >= 24 &&
      v4.barisUi >= 24 &&
      v4.section === 'shortcuts' &&
      v4.settingsOpen === true,
    `command "Help: Show Keyboard Shortcuts" membuka Settings→Shortcuts (${v4.barisUi} baris di UI); ${v4.total} action terdaftar, 17 kombinasi wajib SEMUA ada, konflik binding: ${v4.konflik.length === 0 ? 'tidak ada' : JSON.stringify(v4.konflik)}`,
  );

  // ───────── V5: Split With Browser → pane browser 50/50 dengan shell ─────────
  const v5 = JSON.parse(
    await cdp.runAsync(`
      s.setSettingsOpen(false);
      // Tab panel WAJIB disetel ke 'terminal'.
      //
      // Harness ini ditulis di fase 12, SEBELUM fase 20 menambahkan tab panel
      // bawah (Problems/Output/Debug/Terminal/Ports). Kalau uji lain
      // meninggalkan tab 'problems' aktif, .term-area tidak dirender sama
      // sekali, dan .pane-grid mengukur 0x0 — V5 gagal padahal split-nya benar.
      window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
      await wait(200);
      for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
      await wait(300);
      TS().setVisible(true);
      TS().newTab();
      await wait(300);
      // Placeholder tab kosong harus menampilkan tombol besar itu.
      const adaTombol = !!q('[data-testid="empty-split-browser"]');
      q('[data-testid="empty-split-browser"]').click();
      await wait(2200);
      const tab = TS().activeTab();
      const kinds = (tab?.panes ?? []).map(p => p.kind);
      const grid = q('.pane-grid');
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      const lebar = qa('.pane-grid .pane').map(e => Math.round(e.getBoundingClientRect().width));
      return JSON.stringify({
        adaTombol, kinds, cols, lebar,
        adaFrame: !!q('[data-testid="bp-frame"]') || !!q('[data-testid="bp-blank"]'),
        adaXterm: !!q('.xterm'),
        count: grid?.dataset.paneCount ?? null,
      });
    `),
  );
  const rasio = v5.lebar.length === 2 ? Math.abs(v5.lebar[0] - v5.lebar[1]) : 999;
  check(
    'V5',
    v5.adaTombol === true &&
      JSON.stringify(v5.kinds) === JSON.stringify(['shell', 'browser']) &&
      v5.cols === 2 &&
      rasio <= 6 &&
      v5.adaXterm === true &&
      v5.adaFrame === true,
    `tombol "Split With Browser" di placeholder → 2 pane [${v5.kinds.join(', ')}] dalam grid ${v5.cols} kolom, lebar ${JSON.stringify(v5.lebar)}px (selisih ${rasio}px = 50/50); xterm & pane browser dua-duanya ter-mount`,
  );

  // ───────── V6: URL localhost dev server tampil live ─────────
  const before = hits.length;
  const v6 = JSON.parse(
    await cdp.runAsync(`
      const pane = TS().activeTab().panes.find(p => p.kind === 'browser');
      const el = q('[data-testid="bp-url"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'localhost:${TEST_PORT}');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      el.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await wait(2500);
      const frame = q('[data-testid="bp-frame"]');
      return JSON.stringify({
        paneId: pane.id,
        url: TS().findPane(pane.id)?.url ?? null,
        loads: Number(frame?.dataset.loads ?? -1),
        blocked: q('.browser-pane')?.dataset.bpBlocked ?? null,
        // URL tanpa skema harus dilengkapi jadi http:// (bukan https://)
        judulPane: q('[data-pane-head]')?.textContent ?? '',
      });
    `),
  );
  const reqBaru = hits.slice(before);
  check(
    'V6',
    v6.url === `http://localhost:${TEST_PORT}` &&
      v6.loads >= 1 &&
      v6.blocked === '0' &&
      reqBaru.length >= 1,
    `ketik "localhost:${TEST_PORT}" → dilengkapi jadi ${v6.url}; iframe memuat (event load ${v6.loads}x) dan server uji mencatat ${reqBaru.length} request ${JSON.stringify(reqBaru.slice(0, 3))} — bukti halaman benar-benar diambil, bukan sekadar src di-set`,
  );

  // ───────── V7: situs yang menolak embed → tawaran browser eksternal ─────────
  // Tanpa internet: endpoint /blokir di server uji mengirim X-Frame-Options: DENY,
  // persis seperti google.com. Yang diuji adalah reaksi Zephyr terhadap header itu.
  const v7 = JSON.parse(
    await cdp.runAsync(`
      const el = q('[data-testid="bp-url"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'http://127.0.0.1:${TEST_PORT}/blokir');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      el.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      // Probe ke Rust + render panel penolakan.
      for (let i = 0; i < 40 && !q('[data-testid="bp-blocked"]'); i++) await wait(120);
      await wait(200);
      const panel = q('[data-testid="bp-blocked"]');
      return JSON.stringify({
        adaPanel: !!panel,
        teks: panel?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 210) ?? null,
        header: q('[data-testid="bp-blocked-header"]')?.textContent ?? null,
        adaTombolLuar: !!q('[data-testid="bp-open-external"]'),
        adaRetry: !!q('[data-testid="bp-retry"]'),
        flag: q('.browser-pane')?.dataset.bpBlocked ?? null,
      });
    `),
  );
  // Klik tombol "Buka di browser eksternal" — plugin-opener benar-benar dipanggil.
  const v7klik = JSON.parse(
    await cdp.runAsync(`
      window.__ZEPHYR_ERRORS__.length = 0;
      q('[data-testid="bp-open-external"]').click();
      await wait(1200);
      return JSON.stringify({ err: window.__ZEPHYR_ERRORS__.slice(0, 2) });
    `),
  );
  check(
    'V7',
    v7.adaPanel === true &&
      v7.flag === '1' &&
      /X-Frame-Options: DENY/i.test(v7.header ?? '') &&
      v7.adaTombolLuar === true &&
      v7klik.err.length === 0,
    `URL dengan X-Frame-Options: DENY → panel "menolak embed" muncul dengan header aslinya (${v7.header}); tombol "Buka di browser eksternal" diklik → plugin-opener jalan tanpa error`,
  );

  // ───────── V8: reload & back bekerja; tutup pane membebaskan resource ─────────
  const beforeReload = hits.length;
  const v8 = JSON.parse(
    await cdp.runAsync(`
      // Kembali ke halaman yang bisa di-embed dulu.
      const el = q('[data-testid="bp-url"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const isi = (v) => {
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      };
      isi('http://127.0.0.1:${TEST_PORT}/halaman2');
      for (let i = 0; i < 30 && !q('[data-testid="bp-frame"]'); i++) await wait(100);
      await wait(1400);
      const loadsA = Number(q('[data-testid="bp-frame"]')?.dataset.loads ?? -1);
      const urlA = TS().activeTab().panes.find(p => p.kind === 'browser')?.url ?? null;

      // reload: iframe di-remount (key berubah) → load bertambah, request baru.
      q('[data-testid="bp-reload"]').click();
      await wait(1600);
      const loadsB = Number(q('[data-testid="bp-frame"]')?.dataset.loads ?? -1);

      // back → harus balik ke /blokir (riwayat pane, bukan history iframe)
      const backAktif = !q('[data-testid="bp-back"]').disabled;
      q('[data-testid="bp-back"]').click();
      await wait(1500);
      const urlB = TS().activeTab().panes.find(p => p.kind === 'browser')?.url ?? null;
      const fwdAktif = !q('[data-testid="bp-fwd"]').disabled;
      q('[data-testid="bp-fwd"]').click();
      await wait(1500);
      const urlC = TS().activeTab().panes.find(p => p.kind === 'browser')?.url ?? null;

      // tutup pane browser → iframe hilang dari DOM (tidak ada frame nyangkut)
      const paneId = TS().activeTab().panes.find(p => p.kind === 'browser').id;
      const frameSebelum = qa('iframe.bp-frame').length;
      await TS().closePane(paneId);
      await wait(800);
      return JSON.stringify({
        loadsA, loadsB, urlA, urlB, urlC, backAktif, fwdAktif, frameSebelum,
        frameSesudah: qa('iframe.bp-frame').length,
        paneSisa: TS().activeTab().panes.map(p => p.kind),
        paneHilang: !TS().findPane(paneId),
      });
    `),
  );
  const reqReload = hits.slice(beforeReload);
  check(
    'V8',
    v8.loadsB > v8.loadsA &&
      v8.urlA?.endsWith('/halaman2') &&
      v8.backAktif === true &&
      v8.urlB?.endsWith('/blokir') &&
      v8.fwdAktif === true &&
      v8.urlC?.endsWith('/halaman2') &&
      v8.frameSebelum === 1 &&
      v8.frameSesudah === 0 &&
      v8.paneHilang === true &&
      JSON.stringify(v8.paneSisa) === JSON.stringify(['shell']) &&
      reqReload.length >= 2,
    `reload → event load ${v8.loadsA}→${v8.loadsB} dan server menerima ${reqReload.length} request lagi (${JSON.stringify(reqReload.slice(0, 4))}); back ke /blokir lalu forward ke /halaman2 benar; tutup pane → iframe lenyap dari DOM (1→0), pane sisa [${v8.paneSisa.join(', ')}]`,
  );

  // ───────── V9: Register MCP → path terbaca; /health → log "MCP connected" ─────────
  // Config asli user dibackup dulu lalu DIPULIHKAN di akhir (sama seperti verify11).
  const HOME = process.env.USERPROFILE ?? os.homedir();
  const CFG = path.join(HOME, '.config', 'opencode', 'opencode.json');
  fs.mkdirSync(path.dirname(CFG), { recursive: true });
  const cfgAdaAsli = fs.existsSync(CFG);
  const cfgAsli = cfgAdaAsli ? fs.readFileSync(CFG, 'utf8') : null;
  const bakPath = `${CFG}.bak`;
  const bakAsli = fs.existsSync(bakPath) ? fs.readFileSync(bakPath, 'utf8') : null;
  fs.rmSync(bakPath, { force: true });
  // Pancingan: key lain yang TIDAK boleh rusak.
  fs.writeFileSync(
    CFG,
    JSON.stringify({ theme: 'zephyr-dark', mcp: { lain: { type: 'local' } } }, null, 2),
  );

  const v9a = JSON.parse(
    await cdp.runAsync(
      `
      s.setSettingsOpen(true);
      window.__ZEPHYR_SET__.ui.getState().setSection('mcp');
      await wait(500);
      await M.refresh();
      await M.refreshClis();
      await wait(300);
      if (!M.status()?.running) { await M.toggle(true); await wait(1500); }
      // Panel harus MENAMPILKAN path config tiap CLI (prompt §12.3).
      const rows = qa('[data-testid^="mcp-cli-row-"]').map(e => ({
        id: e.dataset.cliId,
        path: e.querySelector('.mcp-cli-path')?.getAttribute('title') ?? null,
      }));
      M.clearLog();
      await wait(150);
      return JSON.stringify({
        rows,
        port: M.status()?.port ?? null,
        token: M.status()?.token ?? null,
        running: M.status()?.running ?? false,
      });
    `,
      90000,
    ),
  );
  const PORT = v9a.port;
  const TOKEN = v9a.token;
  if (!TOKEN || TOKEN.length < 16) throw new Error('token MCP tidak terbaca dari status');

  // Tulis lewat tombol UI (jalur yang sama dipakai user).
  await cdp.runAsync(
    `
      M.setChecked(['opencode']);
      await wait(200);
      q('[data-testid="mcp-write"]').click();
      for (let i = 0; i < 60 && MS().busy; i++) await wait(100);
      await wait(400);
      await M.refreshClis();
      return 'ok';
    `,
    60000,
  );
  const cfgSetelah = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const adaBak = fs.existsSync(bakPath);

  // Simulasi AI CLI menyambung: /health dengan UA opencode → log "MCP connected".
  const health = await getJson(`http://127.0.0.1:${PORT}/health`, null, 'opencode/1.2 (node)');
  await sleep(700);
  const v9log = JSON.parse(
    await cdp.runAsync(`
      await wait(300);
      const baris = qa('[data-testid="mcp-log-row"]').map(e => e.textContent?.trim() ?? '');
      const badge = q('[data-testid="mcp-reg-opencode"]')?.textContent?.trim() ?? null;
      const hint = q('[data-testid="mcp-hint-restart"]')?.textContent?.replace(/\\s+/g,' ').trim() ?? null;
      return JSON.stringify({ baris, store: M.log().map(l => l.text), badge, hint });
    `),
  );

  // Hapus lagi + pulihkan config user apa adanya.
  await cdp.runAsync(
    `
      q('[data-testid="mcp-unwrite"]').click();
      for (let i = 0; i < 60 && MS().busy; i++) await wait(100);
      await wait(400);
      return 'ok';
    `,
    60000,
  );
  const cfgHapus = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  if (cfgAdaAsli && cfgAsli !== null) fs.writeFileSync(CFG, cfgAsli);
  else fs.rmSync(CFG, { force: true });
  if (bakAsli !== null) fs.writeFileSync(bakPath, bakAsli);
  else fs.rmSync(bakPath, { force: true });

  const entri = cfgSetelah.mcp?.zephyr ?? null;
  check(
    'V9',
    v9a.rows.length === 7 &&
      v9a.rows.every((r) => (r.path ?? '').length > 3) &&
      entri?.type === 'http' &&
      entri?.url === `http://127.0.0.1:${PORT}` &&
      /^Bearer /.test(entri?.headers?.Authorization ?? '') &&
      cfgSetelah.theme === 'zephyr-dark' &&
      cfgSetelah.mcp?.lain?.type === 'local' &&
      adaBak === true &&
      v9log.badge === 'terdaftar' &&
      (v9log.hint ?? '').includes('Restart CLI') &&
      health.status === 200 &&
      v9log.store.some((t) => /MCP connected: opencode/.test(t)) &&
      v9log.baris.some((t) => /MCP connected: opencode/.test(t)) &&
      cfgHapus.mcp?.zephyr === undefined &&
      cfgHapus.theme === 'zephyr-dark' &&
      cfgHapus.mcp?.lain?.type === 'local',
    `panel menampilkan 7 CLI + path config masing-masing (mis. ${v9a.rows[3]?.id} → ${v9a.rows[3]?.path}); tombol Tulis → entri zephyr {type:http, url:${entri?.url}, Bearer} masuk, key lain (theme, mcp.lain) UTUH, .bak dibuat, badge "${v9log.badge}"; GET /health ber-UA opencode → panel mencatat "${v9log.baris.find((t) => /MCP connected/.test(t))}"; setelah dilepas entri hilang & config tetap utuh`,
  );

  // ───────── V10: toast saat screenshot_pane dipanggil dari luar ─────────
  const v10pane = JSON.parse(
    await cdp.runAsync(`
      s.setSettingsOpen(false);
      await wait(200);
      TS().setVisible(true);
      if ((TS().activeTab()?.panes.length ?? 0) === 0) await TS().addPane('shell');
      await wait(1500);
      M.setToast(null);
      M.clearLog();
      const p = TS().activeTab().panes.find(x => x.kind !== 'browser');
      return JSON.stringify({ paneId: p?.id ?? null });
    `),
  );
  const shot = await rpc(
    PORT,
    'screenshot_pane',
    { paneId: v10pane.paneId },
    TOKEN,
    21,
    'claude-code/1.0',
  );
  await sleep(900);
  const v10 = JSON.parse(
    await cdp.runAsync(`
      const el = q('[data-testid="mcp-toast"]');
      return JSON.stringify({
        toastAda: !!el,
        teks: el?.textContent?.replace(/\\s+/g,' ').trim() ?? null,
        store: M.toast(),
        log: M.log().map(l => l.text),
      });
    `),
  );
  const shotPath = shot.body?.result?.path ?? null;
  check(
    'V10',
    shot.status === 200 &&
      typeof shotPath === 'string' &&
      fs.existsSync(shotPath) &&
      v10.toastAda === true &&
      /screenshot/i.test(v10.teks ?? '') &&
      v10.log.some((t) => /screenshot_pane/.test(t)),
    `screenshot_pane via HTTP (UA claude-code) → file ${path.basename(shotPath ?? '')} benar-benar ada di disk (${shotPath ? fs.statSync(shotPath).size : 0} byte) dan Zephyr menampilkan toast "${v10.teks}" — user selalu sadar saat AI mengambil isi pane`,
  );

  // ───────── V11: tsc 0 + tidak ada error console selama seluruh uji ─────────
  const v11 = JSON.parse(
    await cdp.runAsync(
      `
      M.setToast(null);
      // Bersihkan sisa uji: tutup semua tab & pane, kembalikan ke keadaan awal
      // supaya harness fase lain tidak gagal karena state nyangkut.
      CP.close();
      s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
      for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
      s.setSettingsOpen(false);
      s.setActivity('explorer');
      M.clearLog();
      // Pilihan CLI harus dikosongkan lagi: verify08 mengklik checkbox opencode
      // dan akan meng-UNCHECK-nya kalau masih tercentang dari sini.
      M.setChecked([]);
      await s.applySettings({ mcp: { writeToCli: [] } });
      // Workspace juga ditutup: harness fase 02 memeriksa panel Explorer/SCM
      // dalam keadaan "belum ada workspace".
      await s.closeWorkspace();
      await wait(900);
      return JSON.stringify({
        err: (window.__ZEPHYR_ERRORS__ ?? []).slice(0, 4),
        tabs: S.getState().tabs.length,
        panes: TS().terminalTabs.reduce((n, t) => n + t.panes.length, 0),
        settings: S.getState().settingsOpen,
        workspace: S.getState().workspace,
        cmdTotal: CP.commands().length,
      });
    `,
      90000,
    ),
  );
  // tsc dijalankan lewat binary lokal (spawnSync('npx.cmd') gagal di MSYS →
  // status null; node + tsc.js selalu ada di node_modules).
  const tscJs = path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js');
  const tsc = spawnSync(process.execPath, [tscJs, '--noEmit'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const tscOut = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.trim();
  check(
    'V11',
    tsc.status === 0 &&
      tscOut === '' &&
      v11.err.length === 0 &&
      v11.tabs === 0 &&
      v11.panes === 0 &&
      v11.settings === false &&
      v11.workspace === null &&
      v11.cmdTotal >= 40,
    `npx tsc --noEmit exit ${tsc.status} tanpa output; 0 error console sepanjang V1–V10; registry memuat ${v11.cmdTotal} command; state dibersihkan (tab ${v11.tabs}, pane ${v11.panes}, settings ${v11.settings}, workspace ${v11.workspace})`,
  );

  // ───────── tutup ─────────
  // closeAllConnections() WAJIB: iframe pane browser meninggalkan koneksi
  // keep-alive, dan srv.close() sendiri menunggu koneksi itu selesai → proses
  // node menggantung selamanya walau semua uji sudah lulus.
  srv.closeAllConnections?.();
  srv.close();
  // Workspace DIPULIHKAN ke repo sebelum harness ini keluar.
  //
  // V11 sengaja mengosongkan workspace sebagai bukti pembersihan, tapi SANDBOX
  // di bawah dihapus dari disk. Kalau app dibiarkan menunjuk folder yang sudah
  // lenyap, harness berikutnya (verify13 V7) menemukan workspace null +
  // dialog trust menggantung untuk path yang tidak ada — setTrust gagal senyap
  // karena foldernya memang tidak ada lagi.
  await cdp.runAsync(
    `
    // window.__ZEPHYR_WS__ dipakai langsung: prelude verify12 dibuat di fase 12
    // dan tidak punya alias 'WS' (bridge itu baru ada di fase 29).
    await window.__ZEPHYR_WS__.setTrust(${JSON.stringify(process.cwd().replace(/\\/g, '/'))}, true);
    await wait(200);
    await s.openWorkspace(${JSON.stringify(process.cwd().replace(/\\/g, '/'))});
    await wait(600);
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    return 'ok';
  `,
    30000,
  );
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  cdp.close();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  if (lulus !== results.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error(`verify12 error: ${e.message}`);
  process.exitCode = 1;
});




