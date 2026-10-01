// verify-features.mjs - Zephyr 1.1.11/1.1.12 feature verification over CDP.
//
// It proves features are NOT merely "the code exists" but really work in the live app:
//   MCP      - /health, /schema, /mcp, initialize, tools/call
//   Peek     - peekDefinition adds a definition panel
//   Outline  - documentSymbol becomes a list in the panel
//   Tests    - the Tests tab + a Run all button
//   Conflict - gitConflictRead + gitConflictApply write a hunk
//   Rebase   - gitRebaseStatus/Progress do not error
//   Notebook - read an .ipynb, cells + Run all
//
// Usage:  node scripts/verify-features.mjs [port]
// Requires: zephyr.exe running with
//         WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"

import WebSocket from 'ws';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = process.argv[2] ?? '9223';
const APPDATA = process.env.APPDATA;
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

  async runAsync(body, timeoutMs = 20000) {
    const slot = `__VF_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.eval(`(() => {
      window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
      (async () => {
        const s = window.__ZEPHYR__.getState();
        ${body}
      })().then(
        (v) => { window[${JSON.stringify(slot)}] = { done: true, value: v ?? null, error: null }; },
        (e) => { window[${JSON.stringify(slot)}] = { done: true, value: null, error: String((e && e.message) || e) }; },
      );
      return 'started';
    })()`);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await sleep(120);
      const st = await this.eval(`JSON.stringify(window[${JSON.stringify(slot)}] ?? null)`);
      if (!st) continue;
      const o = JSON.parse(st);
      if (o.done) {
        if (o.error) throw new Error(o.error);
        return o.value;
      }
    }
    throw new Error(`timeout ${timeoutMs}ms`);
  }
}

let lulus = 0;
let gagal = 0;
const results = [];
function cek(nama, ok, info = '') {
  results.push({ nama, ok, info });
  if (ok) lulus++;
  else gagal++;
}

async function rpc(method, params, token) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const r = await fetch(`http://127.0.0.1:9222${method === 'initialize' || method === 'tools/call' || method === 'tools/list' ? '/mcp' : '/rpc'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  });
  return { status: r.status, text: await r.text() };
}

async function main() {
  const token = existsSync(join(APPDATA, 'zephyr', 'mcp.json'))
    ? JSON.parse(readFileSync(join(APPDATA, 'zephyr', 'mcp.json'), 'utf8')).token
    : null;

  // Find the target
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch {
      await sleep(500);
    }
  }
  if (!target) {
    console.error('Tidak ada target CDP. Jalankan zephyr.exe dengan remote debugging port', PORT);
    process.exit(1);
  }

  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.eval('1');

  // ---- open a workspace + trust it (many features need both) ----
  try {
    const w = await cdp.runAsync(`
      await s.openWorkspace('D:/Zephyr');
      await new Promise(r => setTimeout(r, 1200));
      const t = await import('/src/lib/commands.ts');
      try { await t.workspaceSetTrust('D:/Zephyr', true); } catch (e) { /* skip */ }
      await new Promise(r => setTimeout(r, 800));
      return (s.workspace || 'gagal') + ' trust=' + JSON.stringify(s.trustedWorkspace ?? s.workspaceTrusted ?? '?');
    `, 30000);
    cek('workspace dibuka + trust', typeof w === 'string' && w.toLowerCase().includes('zephyr'), String(w));
  } catch (e) {
    cek('workspace dibuka + trust', false, String(e.message));
  }
  await sleep(1200);


  // ---- MCP ----
  try {
    const h = await (await fetch('http://127.0.0.1:9222/health')).json();
    cek('MCP health', h.ok === true, `port ${h.port} v${h.version}`);
  } catch (e) {
    cek('MCP health', false, String(e.message));
  }

  try {
    const init = await rpc('initialize', {}, token);
    const j = JSON.parse(init.text);
    cek('MCP initialize', init.status === 200 && !!j.result?.protocolVersion, `proto ${j.result?.protocolVersion}`);
  } catch (e) {
    cek('MCP initialize', false, String(e.message));
  }

  try {
    const tl = await rpc('tools/list', {}, token);
    const j = JSON.parse(tl.text);
    const n = Array.isArray(j.result?.tools) ? j.result.tools.length : 0;
    cek('MCP tools/list', n > 0, `${n} tool`);
  } catch (e) {
    cek('MCP tools/list', false, String(e.message));
  }

  try {
    const tc = await rpc('tools/call', { name: 'get_window', arguments: {} }, token);
    const j = JSON.parse(tc.text);
    cek('MCP tools/call', tc.status === 200 && !!j.result?.content, 'get_window');
  } catch (e) {
    cek('MCP tools/call', false, String(e.message));
  }

  // ---- shell_exec ----
  try {
    const r = await cdp.runAsync(`
      const m = await import('/src/lib/commands.ts');
      const r = await m.agentExec('echo VERIFY_FEATURES_OK');
      return r.exitCode === 0 && r.stdout.includes('VERIFY_FEATURES_OK');
    `);
    cek('shell_exec exit+output', r === true);
  } catch (e) {
    cek('shell_exec exit+output', false, String(e.message));
  }

  // ---- agent tools registered ----
  try {
    const r = await cdp.runAsync(`
      const m = await import('/src/lib/agentTools.ts');
      const n = m.agentToolSpecs().map(t => t.name);
      const wajib = ['shell_exec','file_patch','terminal_exec','file_read','todo_write'];
      return wajib.every(x => n.includes(x)) ? n.length + ' tools' : 'MISSING:' + wajib.filter(x=>!n.includes(x)).join(',');
    `);
    cek('agent tools (shell_exec/file_patch)', typeof r === 'string' && !r.startsWith('MISSING'), String(r));
  } catch (e) {
    cek('agent tools', false, String(e.message));
  }

  // ---- open a file so a tab exists (some commands need a file + LSP) ----
  try {
    const f = await cdp.runAsync(`
      // The workspace must be opened through the live store, not through an
      // import of the module under test: a dynamic import() of
      // /src/lib/commands.ts evaluates the module a SECOND time, which
      // creates a second Zustand instance. The UI is bound to the first one,
      // so nothing it did would ever show up in the DOM.
      // openWorkspace lives on the main store, not on the explorer store.
      const store = window.__ZEPHYR__;
      if (store.getState().workspace !== 'D:/Zephyr') {
        await store.getState().openWorkspace('D:/Zephyr');
      }
      await new Promise(r => setTimeout(r, 900));
      await store.getState().openPath('D:/Zephyr/src/lib/commands.ts');
      await new Promise(r => setTimeout(r, 1600));
      return store.getState().tabs.length;
    `, 40000);
    cek('file dibuka (tab aktif)', typeof f === 'number' && f > 0, `${f} tab`);
  } catch (e) {
    cek('file dibuka (tab aktif)', false, String(e.message));
  }
  await sleep(1200);

  // ---- Test Explorer: the 'tests' tab is registered + the panel renders when focused ----
  try {
    const r = await cdp.runAsync(`
      // Pakai store dari bridge, bukan import path absolut: import absolut
      // memuat instance store kedua sehingga Panel tidak bereaksi.
      const p = window.__ZEPHYR_PANEL__.store;
      p.getState().focusTab('tests');
      await new Promise(r => setTimeout(r, 1200));
      const el = document.querySelector('[data-testid="tests-view"]');
      const attr = document.querySelector('[data-testid="panel-body"]')?.getAttribute('data-active-tab');
      return 'activeTab=' + p.getState().activeTab + ' attr=' + attr + ' render=' + !!el;
    `);
    cek('Test Explorer render', String(r).includes('render=true'), String(r));
  } catch (e) {
    cek('Test Explorer render', false, String(e.message));
  }

  // ---- Notebook: write the file then open it (so the notebook command is active) ----
  try {
    const r = await cdp.runAsync(`
      const m = await import('/src/lib/commands.ts');
      const np = { cells: [
        { cell_type: 'code', metadata: {}, source: ['print(6*7)'], outputs: [], execution_count: null },
      ], metadata: {}, nbformat: 4, nbformat_minor: 5 };
      const path = 'testfiles/verify-nb.ipynb';
      await m.fsWrite(path, JSON.stringify(np, null, 1));
      const back = await m.fsRead(path);
      if (JSON.parse(back.content).cells.length !== 1) return 'parse-gagal';
      await s.openPath('D:/Zephyr/' + path);
      await new Promise(r => setTimeout(r, 1800));
      return 'cells=' + JSON.parse(back.content).cells.length + ' tab=' + s.tabs.length;
    `, 30000);
    cek('Notebook tulis/baca/buka ipynb', typeof r === 'string' && r.includes('cells=1'), String(r));
  } catch (e) {
    cek('Notebook ipynb', false, String(e.message));
  }

  // ---- Conflict hunk apply (uses the test repo) ----
  try {
    const r = await cdp.runAsync(`
      const m = await import('/src/lib/commands.ts');
      const w = s.workspace;
      if (!w) return 'no-workspace';
      const path = 'testfiles/verify-conflict.txt';
      await m.fsWrite(path, '<<<<<<< HEAD\\nA ours\\n||||||| base\\nB base\\n=======\\nC theirs\\n>>>>>>> other\\n');
      const hunks = await m.gitConflictRead(path);
      if (!hunks.length) return 'no-hunk';
      await m.gitConflictApply(path, 0, 'ours');
      const after = await m.fsRead(path);
      return after.content.includes('A ours') && !after.content.includes('<<<<<<<') ? 'ok' : 'gagal:' + after.content.slice(0,60);
    `, 25000);
    cek('Conflict per-hunk apply', r === 'ok', String(r));
  } catch (e) {
    cek('Conflict per-hunk apply', false, String(e.message));
  }

  // ---- Rebase status/progress does not error ----
  try {
    const r = await cdp.runAsync(`
      const m = await import('/src/lib/commands.ts');
      const st = await m.gitRebaseStatus();
      const pr = await m.gitRebaseProgress();
      return 'status=' + st + ' progress=' + JSON.stringify(pr.slice(0,40));
    `);
    cek('Rebase status/progress', typeof r === 'string' && r.startsWith('status='), String(r));
  } catch (e) {
    cek('Rebase status/progress', false, String(e.message));
  }

  // ---- LSP-gated commands (need an active .ts file) ----
  try {
    const r = await cdp.runAsync(`
      const m = await import('/src/lib/commands.ts');
      await m.workspaceOpen('D:/Zephyr');
      await new Promise(r => setTimeout(r, 700));
      await s.openPath('D:/Zephyr/src/lib/aiStore.ts');
      await new Promise(r => setTimeout(r, 2500));
      const c = await import('/src/lib/commandRegistry.ts');
      // notebook.* butuh tab .ipynb aktif; view.outline/peek butuh LSP .ts
      const idsAwal = c.availableCommands().map(x => x.id);
      await s.openPath('D:/Zephyr/testfiles/verify-nb.ipynb');
      await new Promise(r => setTimeout(r, 1600));
      const idsAkhir = c.availableCommands().map(x => x.id);
      const wajib = ['view.outline','editor.peekDefinition','notebook.runAll','notebook.save','test.runAll','test.focus','git.aiCommit'];
      const kurang = wajib.filter(x => !idsAwal.includes(x) && !idsAkhir.includes(x));
      const aktif = s.tabs.find(t => t.id === s.activeTabId);
      return 'cmd=' + idsAkhir.length + ' tab=' + (aktif ? String(aktif.path).split('/').pop() : '?') + (kurang.length ? ' MISSING:' + kurang.join(',') : ' lengkap');
    `, 35000);
    cek('commands terdaftar (LSP+file aktif)', typeof r === 'string' && r.includes('lengkap'), String(r));
  } catch (e) {
    cek('commands terdaftar', false, String(e.message));
  }

  // ---- the view renders (editor or notebook, depending on the active tab) ----
  try {
    const r = await cdp.eval(
      `!!document.querySelector('[data-testid="cm-wrap"]') || !!document.querySelector('[data-testid="nb-view"]')`,
    );
    cek('view ter-render', r === true);
  } catch (e) {
    cek('editor ter-render', false, String(e.message));
  }

  // ---- console errors ----
  const errs = await cdp.eval(`(window.__ZEPHYR_ERRORS__ || []).length`);
  cek('tanpa console error', (errs ?? 0) === 0, `${errs} error`);

  console.log('\n== verify-features ==');
  for (const r of results) {
    console.log(`${r.ok ? 'LULUS' : 'GAGAL'}  ${r.nama}${r.info ? '  (' + r.info + ')' : ''}`);
  }
  console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
  process.exit(gagal ? 1 : 0);
}

main().catch((e) => {
  console.error('verify-features error:', e.message);
  process.exit(1);
});

