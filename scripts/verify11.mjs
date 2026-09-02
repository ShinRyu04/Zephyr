// verify11.mjs — verifikasi V1..V12 fase 11 (MCP server 9222)
//
// Pakai:  node scripts/verify11.mjs [portCdp]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup
//
// Prinsip: bukti dari DUA sisi. Permintaan dikirim lewat HTTP sungguhan ke
// 127.0.0.1:<port> (seperti AI CLI luar), lalu efeknya dibaca dari DOM/store
// yang hidup lewat CDP. Tidak ada mock: server, PTY, dan tab editor asli.
//
// Catatan: __ZEPHYR_MCP__ hanya ada di mode dev (devBridge.ts).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';

const CDP_PORT = process.argv[2] ?? '9223';
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
    const slot = `__ZV11_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const S = window.__ZEPHYR__;
        const s = window.__ZEPHYR__.getState();
        const T = window.__ZEPHYR_TERM__;
        const TS = () => window.__ZEPHYR_TERM__.getState();
        const M = window.__ZEPHYR_MCP__;
        const MS = () => window.__ZEPHYR_MCP__.store.getState();
        const SET = window.__ZEPHYR_SET__;
        const PTY = window.__ZEPHYR_PTY__;
        const q = (sel) => document.querySelector(sel);
        const qa = (sel) => [...document.querySelectorAll(sel)];
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        /** Buka Settings → MCP seperti user (ActivityBar + nav sidebar). */
        const bukaMcp = async () => {
          const st = S.getState();
          st.setActivity('settings');
          st.setSettingsOpen(true);
          if (!S.getState().sidebarVisible) st.toggleSidebar();
          SET.ui.getState().setSection('mcp');
          await wait(250);
        };
        const tunggu = async (ms = 20000) => {
          const batas = Date.now() + ms;
          while (MS().busy && Date.now() < batas) await wait(80);
          await wait(120);
          return !MS().busy;
        };
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

// ───────────────────── util HTTP / port ─────────────────────

/** Panggil MCP lewat HTTP seperti AI CLI luar. Server mati = status 0. */
async function rpc(port, method, params = {}, token = null, id = 1) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } catch (e) {
    // ECONNREFUSED = port tidak listening; itu jawaban yang sah untuk V1/V9.
    return { status: 0, body: String(e.message ?? e) };
  }
}

async function getJson(url, token = null) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: String(e.message ?? e) };
  }
}

/** true = ada yang listening di port itu (bukti setara netstat). */
function portListening(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(700);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, '127.0.0.1');
  });
}

/** Blokir sebuah port dengan server dummy (untuk uji fallback V10). */
function hogPort(port) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer((c) => c.end());
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

const TMP = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp');
const HOME = process.env.USERPROFILE ?? os.homedir();
const OPENCODE = path.join(HOME, '.config', 'opencode', 'opencode.json');

// ───────────────────────── main ─────────────────────────

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  if ((await cdp.eval('typeof window.__ZEPHYR_MCP__')) === 'undefined') {
    throw new Error('__ZEPHYR_MCP__ tidak ada — reload halaman (devBridge fase 11)');
  }

  // Kondisi awal: server MATI, panel MCP terbuka, tidak ada tab/pane sisa.
  const awal = JSON.parse(
    await cdp.runAsync(`
      await M.toggle(false);
      await tunggu();
      s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
      for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
      await wait(300);
      await bukaMcp();
      await M.refresh();
      window.__ZEPHYR_ERRORS__.length = 0;
      const st = MS().status;
      return JSON.stringify({ token: st?.token ?? null, port: st?.port ?? null });
    `),
  );
  const TOKEN = awal.token;
  const PORT = awal.port ?? 9222;
  if (!TOKEN || TOKEN.length < 16) throw new Error('token MCP tidak ada di mcp.json');

  // ───────── V1: default OFF → /health 503, port tidak listening ─────────
  const h0 = await getJson(`http://127.0.0.1:${PORT}/health`);
  const listen0 = await portListening(PORT);
  const v1dom = JSON.parse(
    await cdp.runAsync(`
      const el = q('[data-testid="mcp-status"]');
      return JSON.stringify({
        running: el?.dataset.running ?? null,
        teks: el?.textContent?.trim() ?? null,
        switchOn: q('[data-testid="mcp-enable"]')?.getAttribute('aria-checked') ?? null,
      });
    `),
  );
  check(
    'V1',
    (h0.status === 503 || h0.status === 0) &&
      listen0 === false &&
      v1dom.running === '0' &&
      v1dom.switchOn === 'false',
    `server mati: /health → ${h0.status === 0 ? 'tidak ada koneksi' : h0.status}, port ${PORT} TIDAK listening; UI "${v1dom.teks}"`,
  );

  // ───────── V2: nyalakan → /health ok, tanpa token 401, dengan token OK ─────────
  const v2ui = JSON.parse(
    await cdp.runAsync(`
      q('[data-testid="mcp-enable"]').click();
      await tunggu();
      await wait(600);
      await M.refresh();
      const el = q('[data-testid="mcp-status"]');
      return JSON.stringify({
        running: el?.dataset.running, port: el?.dataset.port,
        teks: el?.textContent?.trim(), info: MS().mcpInfo, error: MS().mcpError,
      });
    `),
  );
  const livePort = Number(v2ui.port || PORT);
  const h1 = await getJson(`http://127.0.0.1:${livePort}/health`);
  const noAuth = await rpc(livePort, 'get_window');
  const badAuth = await rpc(livePort, 'get_window', {}, 'token-salah');
  const okAuth = await rpc(livePort, 'get_window', {}, TOKEN);
  const schemaNoAuth = await getJson(`http://127.0.0.1:${livePort}/mcp`);
  const schemaAuth = await getJson(`http://127.0.0.1:${livePort}/mcp`, TOKEN);
  check(
    'V2',
    h1.status === 200 &&
      h1.body?.ok === true &&
      noAuth.status === 401 &&
      badAuth.status === 401 &&
      okAuth.status === 200 &&
      okAuth.body?.result?.workspace !== undefined &&
      schemaNoAuth.status === 401 &&
      Array.isArray(schemaAuth.body?.tools),
    `switch ON → /health {ok:true, version ${h1.body?.version}, uptime ${h1.body?.uptimeMs}ms}; tanpa Bearer 401, token salah 401, token benar 200; GET /mcp butuh auth & memuat ${schemaAuth.body?.tools?.length} tool; UI "${v2ui.teks}"`,
  );

  // ───────── V3: list_panes = pane yang benar-benar terbuka ─────────
  const dibuat = JSON.parse(
    await cdp.runAsync(`
      const a = await TS().addPane('shell');
      await wait(900);
      const b = await TS().addPane('private');
      await wait(900);
      return JSON.stringify({ a, b, jumlah: TS().terminalTabs.reduce((n,t)=>n+t.panes.length,0) });
    `),
  );
  const panes = await rpc(livePort, 'list_panes', {}, TOKEN, 3);
  const list = panes.body?.result ?? [];
  const term = await rpc(livePort, 'list_terminals', {}, TOKEN, 4);
  check(
    'V3',
    Array.isArray(list) &&
      list.length === 2 &&
      list.some((p) => p.paneId === dibuat.a && p.type === 'shell' && p.running === true) &&
      list.some((p) => p.paneId === dibuat.b && p.type === 'private') &&
      list.every((p) => typeof p.pid === 'number' && p.pid > 0) &&
      JSON.stringify(term.body?.result) === JSON.stringify(list),
    `list_panes → ${list.length} pane: ${list.map((p) => `${p.type}(pid ${p.pid}${p.running ? ', running' : ''})`).join(', ')}; list_terminals identik`,
  );

  // ───────── V4: terminal_write → teks muncul di terminal NYATA ─────────
  const marker = `MCP-V4-${Date.now().toString(36)}`;
  const w1 = await rpc(
    livePort,
    'terminal_write',
    { paneId: dibuat.a, data: `echo ${marker}` },
    TOKEN,
    5,
  );
  const k1 = await rpc(livePort, 'terminal_key', { paneId: dibuat.a, key: 'Enter' }, TOKEN, 6);
  await sleep(2200);
  const layar = await cdp.runAsync(
    `return PTY.read(${JSON.stringify(dibuat.a)}, 60);`,
  );
  const badPane = await rpc(livePort, 'terminal_write', { paneId: 'pane-hantu', data: 'x' }, TOKEN, 7);
  // Baris echo & hasilnya: hasil eksekusi = marker berdiri sendiri.
  const barisMarker = String(layar)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l === marker);
  check(
    'V4',
    w1.status === 200 &&
      w1.body?.result?.ok === true &&
      k1.body?.result?.ok === true &&
      barisMarker.length >= 1 &&
      badPane.body?.error?.message?.includes('pane-hantu'),
    `terminal_write "echo ${marker}" + terminal_key Enter → shell mengeksekusinya, buffer xterm memuat baris hasil "${marker}" (${barisMarker.length}x); paneId salah dijawab error JSON-RPC`,
  );

  // ───────── V5: editor_open → tab baru muncul & fokus (terlihat di UI) ─────────
  const SANDBOX = path.join(TMP, `zephyr-mcp-${process.pid}`);
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(SANDBOX, { recursive: true });
  const FILE = path.join(SANDBOX, 'dari-mcp.txt');
  fs.writeFileSync(FILE, 'baris satu dari disk\nbaris dua\n');

  const eo = await rpc(livePort, 'editor_open', { path: FILE }, TOKEN, 8);
  const tabId = eo.body?.result?.tabId;
  await sleep(500);
  const v5 = JSON.parse(
    await cdp.runAsync(`
      const tab = s.tabs.find(t => t.id === ${JSON.stringify(tabId)});
      const aktif = S.getState().activeTabId === ${JSON.stringify(tabId)};
      // Bukti UI: tab bar memuat nama file & area editor ter-mount.
      const judul = qa('[data-testid="tab"], .tab').map(e => e.textContent?.trim()).filter(Boolean);
      return JSON.stringify({
        ada: !!tab, isi: tab?.content ?? null, aktif,
        dirty: tab?.unsaved ?? null,
        judul, adaEditor: !!q('.cm-editor'),
        settingsTertutup: S.getState().settingsOpen === false,
      });
    `),
  );
  const editors = await rpc(livePort, 'list_editors', {}, TOKEN, 9);
  const entri = (editors.body?.result ?? []).find((x) => x.tabId === tabId);
  check(
    'V5',
    eo.status === 200 &&
      v5.ada === true &&
      v5.aktif === true &&
      v5.dirty === false &&
      v5.adaEditor === true &&
      v5.judul.some((x) => x.includes('dari-mcp')) &&
      entri?.path === FILE &&
      entri?.active === true,
    `editor_open ${path.basename(FILE)} → tab ${tabId} dibuat & difokuskan (tab bar: ${JSON.stringify(v5.judul)}), CodeMirror ter-mount, halaman Settings otomatis ditutup; list_editors mengonfirmasi path & active`,
  );

  // ───────── V6: editor_insert → buffer berubah + dirty, disk TIDAK ─────────
  const ins = await rpc(
    livePort,
    'editor_insert',
    { tabId, text: 'DISISIPKAN-OLEH-MCP\n', at: 0 },
    TOKEN,
    10,
  );
  await sleep(400);
  const v6 = JSON.parse(
    await cdp.runAsync(`
      const tab = s.tabs.find(t => t.id === ${JSON.stringify(tabId)});
      // Titik dirty di tab bar (bukti visual, bukan sekadar state).
      const dot = qa('.tab-dot').length;
      const cm = window.__ZEPHYR_CM__()?.state.doc.toString() ?? null;
      return JSON.stringify({ isi: tab?.content ?? null, dirty: tab?.unsaved, dot, cm });
    `),
  );
  const diskSetelahInsert = fs.readFileSync(FILE, 'utf8');
  // editor_write: ganti seluruh buffer.
  const ew = await rpc(
    livePort,
    'editor_write',
    { tabId, content: 'ISI BARU PENUH DARI MCP\n' },
    TOKEN,
    11,
  );
  await sleep(400);
  const v6b = JSON.parse(
    await cdp.runAsync(`
      const tab = s.tabs.find(t => t.id === ${JSON.stringify(tabId)});
      return JSON.stringify({ isi: tab?.content ?? null, dirty: tab?.unsaved });
    `),
  );
  const diskSetelahWrite = fs.readFileSync(FILE, 'utf8');
  check(
    'V6',
    ins.status === 200 &&
      String(v6.isi).startsWith('DISISIPKAN-OLEH-MCP') &&
      v6.dirty === true &&
      v6.dot >= 1 &&
      String(v6.cm).startsWith('DISISIPKAN-OLEH-MCP') &&
      diskSetelahInsert === 'baris satu dari disk\nbaris dua\n' &&
      ew.body?.result?.savedToDisk === false &&
      v6b.isi === 'ISI BARU PENUH DARI MCP\n' &&
      diskSetelahWrite === 'baris satu dari disk\nbaris dua\n',
    `editor_insert at=0 → buffer & dokumen CodeMirror berubah, dot dirty muncul (${v6.dot}); editor_write mengganti seluruh buffer; FILE DI DISK tetap isi asli pada kedua kasus (kontrak: buffer saja)`,
  );

  // ───────── V7: run_command "terminal.new" → pane baru ─────────
  const sebelumPane = (await rpc(livePort, 'list_panes', {}, TOKEN, 12)).body?.result?.length ?? 0;
  const rc = await rpc(livePort, 'run_command', { id: 'terminal.new' }, TOKEN, 13);
  await sleep(1200);
  const sesudahPane = (await rpc(livePort, 'list_panes', {}, TOKEN, 14)).body?.result ?? [];
  const paneBaru = rc.body?.result?.paneId;
  const rcBad = await rpc(livePort, 'run_command', { id: 'tidak.ada' }, TOKEN, 15);
  const v7 = JSON.parse(
    await cdp.runAsync(`
      const ada = TS().findPane(${JSON.stringify(paneBaru)});
      return JSON.stringify({
        ada: !!ada, status: ada?.status ?? null,
        panelTerlihat: TS().visible,
        aksiTerakhir: MS().lastAction?.type ?? null,
        dilayani: MS().served,
      });
    `),
  );
  check(
    'V7',
    rc.status === 200 &&
      typeof paneBaru === 'string' &&
      sesudahPane.length === sebelumPane + 1 &&
      v7.ada === true &&
      v7.status === 'live' &&
      v7.panelTerlihat === true &&
      rcBad.body?.error?.message?.includes('tidak dikenal'),
    `run_command terminal.new → pane ${paneBaru} hidup (${sebelumPane} → ${sesudahPane.length} pane), panel terminal terlihat; command tak dikenal dijawab error berisi daftar yang tersedia; panel mencatat ${v7.dilayani} permintaan dilayani`,
  );

  // ───────── V8: tulis ke config opencode + backup + hapus lagi ─────────
  // Pancingan: config berisi key lain yang TIDAK boleh rusak.
  fs.mkdirSync(path.dirname(OPENCODE), { recursive: true });
  const punyaAsli = fs.existsSync(OPENCODE);
  const asli = punyaAsli ? fs.readFileSync(OPENCODE, 'utf8') : null;
  const bakPath = `${OPENCODE}.bak`;
  const bakAsli = fs.existsSync(bakPath) ? fs.readFileSync(bakPath, 'utf8') : null;
  fs.writeFileSync(
    OPENCODE,
    JSON.stringify(
      { $schema: 'https://opencode.ai/config.json', theme: 'tokyonight', mcp: { lain: { type: 'local' } } },
      null,
      2,
    ),
  );

  await cdp.runAsync(`
    // editor_open menutup halaman Settings (biar tab terlihat) — buka lagi
    // supaya panel MCP ada di DOM sebelum tombolnya diklik.
    await bukaMcp();
    M.setChecked(['opencode']);
    await wait(150);
    q('[data-testid="mcp-write"]').click();
    await tunggu();
    await wait(300);
    return 'ok';
  `);
  const tulis = JSON.parse(fs.readFileSync(OPENCODE, 'utf8'));
  const bakAda = fs.existsSync(bakPath);
  const bakIsi = bakAda ? JSON.parse(fs.readFileSync(bakPath, 'utf8')) : null;
  const v8ui = JSON.parse(
    await cdp.runAsync(`
      await M.refreshClis();
      await wait(200);
      const badge = q('[data-testid="mcp-reg-opencode"]')?.textContent?.trim() ?? null;
      return JSON.stringify({
        badge, hasil: MS().lastWrite.map(r => ({ id: r.id, ok: r.ok, backup: r.backup })),
        info: MS().mcpInfo, error: MS().mcpError,
      });
    `),
  );

  await cdp.runAsync(`
    q('[data-testid="mcp-unwrite"]').click();
    await tunggu();
    await wait(300);
    await M.refreshClis();
    return 'ok';
  `);
  const setelahHapus = JSON.parse(fs.readFileSync(OPENCODE, 'utf8'));

  // Kembalikan config user apa adanya.
  if (punyaAsli && asli !== null) fs.writeFileSync(OPENCODE, asli);
  else fs.rmSync(OPENCODE, { force: true });
  if (bakAsli !== null) fs.writeFileSync(bakPath, bakAsli);
  else fs.rmSync(bakPath, { force: true });

  check(
    'V8',
    tulis.mcp?.zephyr?.type === 'http' &&
      tulis.mcp?.zephyr?.url === `http://127.0.0.1:${livePort}` &&
      tulis.mcp?.zephyr?.headers?.Authorization === `Bearer ${TOKEN}` &&
      tulis.mcp?.lain?.type === 'local' &&
      tulis.theme === 'tokyonight' &&
      bakAda &&
      bakIsi?.mcp?.zephyr === undefined &&
      v8ui.badge === 'terdaftar' &&
      setelahHapus.mcp?.zephyr === undefined &&
      setelahHapus.mcp?.lain?.type === 'local' &&
      setelahHapus.theme === 'tokyonight',
    `centang opencode + [Tulis ke CLI] → opencode.json punya mcp.zephyr (url 127.0.0.1:${livePort}, header Bearer), key lain (theme, mcp.lain) UTUH, backup .bak dibuat tanpa entri zephyr, badge UI "${v8ui.badge}"; [Lepas dari CLI] → entri zephyr hilang, config tetap valid`,
  );

  // ───────── V9: matikan di tengah sesi → 503, hidupkan lagi → normal ─────────
  const sebelumMati = await rpc(livePort, 'get_window', {}, TOKEN, 16);
  await cdp.runAsync(`
    q('[data-testid="mcp-enable"]').click();
    await tunggu();
    await wait(500);
    return 'ok';
  `);
  const matiHealth = await getJson(`http://127.0.0.1:${livePort}/health`);
  const matiRpc = await rpc(livePort, 'get_window', {}, TOKEN, 17);
  const matiListen = await portListening(livePort);
  await cdp.runAsync(`
    q('[data-testid="mcp-enable"]').click();
    await tunggu();
    await wait(700);
    await M.refresh();
    return 'ok';
  `);
  const hidupLagi = await rpc(livePort, 'list_panes', {}, TOKEN, 18);
  const hidupHealth = await getJson(`http://127.0.0.1:${livePort}/health`);
  check(
    'V9',
    sebelumMati.status === 200 &&
      (matiHealth.status === 503 || matiHealth.status === 0) &&
      (matiRpc.status === 503 || matiRpc.status === 0) &&
      matiListen === false &&
      hidupHealth.status === 200 &&
      hidupLagi.status === 200 &&
      Array.isArray(hidupLagi.body?.result),
    `switch OFF saat CLI aktif → /health & JSON-RPC ${matiHealth.status === 0 ? 'menolak koneksi' : matiHealth.status}, port ${livePort} berhenti listening; switch ON lagi → /health 200 dan list_panes normal (${hidupLagi.body?.result?.length} pane)`,
  );

  // ───────── V10: port utama dipakai → fallback ke 9223 + terlihat di UI ─────────
  // Matikan server, blokir port utama dengan proses lain, nyalakan lagi.
  await cdp.runAsync(`
    await M.toggle(false);
    await tunggu();
    await wait(400);
    return 'ok';
  `);
  const wantPort = livePort;
  let hog = null;
  let v10 = { ok: false, detail: '' };
  try {
    hog = await hogPort(wantPort);
    const ui = JSON.parse(
      await cdp.runAsync(`
        await M.toggle(true);
        await tunggu();
        await wait(700);
        await M.refresh();
        const el = q('[data-testid="mcp-status"]');
        const st = MS().status;
        return JSON.stringify({
          domPort: el?.dataset.port ?? null,
          teks: el?.textContent?.trim() ?? null,
          port: st?.port ?? null, requested: st?.requestedPort ?? null,
          banner: q('[data-testid="mcp-fallback"]')?.textContent?.trim() ?? null,
          settingPort: S.getState().settings.mcp.port,
        });
      `),
    );
    const alt = Number(ui.port);
    const healthAlt = await getJson(`http://127.0.0.1:${alt}/health`);
    const rpcAlt = await rpc(alt, 'get_window', {}, TOKEN, 19);
    v10 = {
      ok:
        alt > wantPort &&
        alt <= wantPort + 4 &&
        healthAlt.status === 200 &&
        rpcAlt.status === 200 &&
        ui.domPort === String(alt) &&
        ui.settingPort === alt &&
        !!ui.banner,
      detail: `port ${wantPort} diblokir proses lain → server bind ke ${alt} (kandidat ${wantPort}..${wantPort + 4}; 9223 di mesin ini dipakai debug port WebView2): /health 200, JSON-RPC 200; UI menampilkan "${ui.teks}" + banner "${String(ui.banner).slice(0, 60)}…"; settings.mcp.port ikut jadi ${ui.settingPort}`,
    };
  } catch (e) {
    v10 = { ok: false, detail: `gagal menguji fallback: ${e.message ?? e}` };
  } finally {
    if (hog) await new Promise((r) => hog.close(r));
  }
  check('V10', v10.ok, v10.detail);

  // Kembalikan port ke 9222 lalu restart server di port itu.
  const finalPort = JSON.parse(
    await cdp.runAsync(`
      await M.toggle(false);
      await tunggu();
      await s.applySettings({ mcp: { port: ${wantPort} } });
      await wait(250);
      await M.toggle(true);
      await tunggu();
      await wait(600);
      await M.refresh();
      return JSON.stringify({ port: MS().status?.port ?? null });
    `),
  );
  const P = Number(finalPort.port ?? wantPort);

  // ───────── V11: dua agent bersamaan → serialized, tidak kacau ─────────
  // 12 permintaan tulis ke tab yang sama, dua "agent" bergantian. Kalau tidak
  // diserialisasi, isi buffer jadi campur aduk / ada yang hilang.
  const tab2 = (await rpc(P, 'editor_open', { path: FILE }, TOKEN, 20)).body?.result?.tabId;
  await rpc(P, 'editor_write', { tabId: tab2, content: '' }, TOKEN, 21);
  const jobs = [];
  for (let i = 1; i <= 12; i++) {
    const agent = i % 2 === 0 ? 'B' : 'A';
    jobs.push(
      rpc(P, 'editor_insert', { tabId: tab2, text: `${agent}${i};` }, TOKEN, 100 + i),
    );
  }
  const hasil = await Promise.all(jobs);
  await sleep(600);
  const v11 = JSON.parse(
    await cdp.runAsync(`
      const tab = s.tabs.find(t => t.id === ${JSON.stringify(tab2)});
      return JSON.stringify({ isi: tab?.content ?? '', errors: window.__ZEPHYR_ERRORS__.length, dilayani: MS().served });
    `),
  );
  const semuaAda = Array.from({ length: 12 }, (_, i) => `${(i + 1) % 2 === 0 ? 'B' : 'A'}${i + 1};`);
  const hilang = semuaAda.filter((tok) => !String(v11.isi).includes(tok));
  const semua200 = hasil.every((r) => r.status === 200 && r.body?.result?.tabId === tab2);
  check(
    'V11',
    semua200 && hilang.length === 0 && v11.errors === 0,
    `12 permintaan editor_insert dari dua agent dikirim BERSAMAAN → semua dijawab 200, ke-12 token utuh di buffer (tidak ada yang hilang/tercampur), 0 console error; total dilayani ${v11.dilayani}`,
  );

  // ───────── V12: keamanan + jalur lain (bukti kontrak dijaga) ─────────
  const setBoleh = await rpc(P, 'set_setting', { key: 'editor.tabSize', value: 8 }, TOKEN, 30);
  await sleep(500);
  const setTolak = await rpc(P, 'set_setting', { key: 'mcp.enabled', value: false }, TOKEN, 31);
  const setTolak2 = await rpc(P, 'set_setting', { key: 'git.github.clientId', value: 'x' }, TOKEN, 32);
  const getS = await rpc(P, 'get_settings', {}, TOKEN, 33);
  const getTok = await rpc(P, 'get_setting', { key: 'mcp.token' }, TOKEN, 34);
  const shot = await rpc(P, 'screenshot_pane', { paneId: dibuat.a }, TOKEN, 35);
  const shotPath = shot.body?.result?.path;
  const shotIsi = shotPath && fs.existsSync(shotPath) ? fs.readFileSync(shotPath, 'utf8') : '';
  const ext = await rpc(P, 'list_extensions', {}, TOKEN, 36);
  const v12 = JSON.parse(
    await cdp.runAsync(`
      return JSON.stringify({ tabSize: S.getState().settings.editor.tabSize, shot: MS().lastShot });
    `),
  );
  check(
    'V12',
    setBoleh.status === 200 &&
      v12.tabSize === 8 &&
      setTolak.body?.error?.message?.includes('tidak boleh diubah') &&
      setTolak2.body?.error?.message?.includes('tidak boleh diubah') &&
      getS.body?.result?.mcp?.token === '***' &&
      getS.body?.result?.git?.github === undefined &&
      getTok.body?.error?.code !== undefined &&
      shot.status === 200 &&
      shotIsi.includes(marker) &&
      Array.isArray(ext.body?.result) &&
      ext.body.result.length === 6,
    `set_setting editor.tabSize=8 diterima (UI ikut jadi ${v12.tabSize}); mcp.enabled & git.github.clientId DITOLAK whitelist; get_settings memask mcp.token → "***" dan membuang git.github; get_setting mcp.token ditolak; screenshot_pane menulis ${path.basename(String(shotPath))} berisi isi terminal nyata; list_extensions → ${ext.body?.result?.length} ekstensi`,
  );

  // ───────── bersih-bersih ─────────
  await cdp.runAsync(`
    s.tabs.slice().forEach((t) => s.forceCloseTab(t.id));
    for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
    await s.applySettings({ editor: { tabSize: 2 }, mcp: { writeToCli: [] } });
    M.setChecked([]);
    MS().setError(null);
    MS().setInfo(null);
    await wait(300);
    // Fase 02/03 memeriksa empty-state editor: tutup halaman Settings.
    S.getState().setSettingsOpen(false);
    S.getState().setActivity('explorer');
    await wait(200);
    return 'bersih';
  `);
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  if (shotPath) fs.rmSync(shotPath, { force: true });

  cdp.close();

  const lulus = results.filter((r) => r.ok).length;
  console.log(`\n== ${lulus}/${results.length} lulus ==`);
  if (lulus !== results.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error('verify11 error:', e.message ?? e);
  process.exitCode = 2;
});



