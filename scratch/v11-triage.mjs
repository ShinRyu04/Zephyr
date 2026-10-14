/*
 * Triage verify11 (V4-V8, V11, V12): ambil BUKTI MENTAH untuk tiap syarat yang
 * gagal, lewat satu jalan pintas - bukan dengan menebak dari string ringkasan.
 *
 * Semua lewat jalur nyata: HTTP JSON-RPC ke server MCP app + baca DOM/store.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Cdp } from '../scripts/lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
if (!page) throw new Error('target Zephyr tidak ditemukan');
const { cdp } = await Cdp.attach(Number(CDP_PORT), 'Zephyr');

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
    let body;
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

const J = (x) => JSON.stringify(x);

// Info dasar + token dari store (server harus hidup).
const dasar = JSON.parse(
  await cdp.runAsync(`
    const MS_ = () => M.store.getState();
    await M.refresh();
    return JSON.stringify({
      status: MS_().status, served: MS_().served, error: MS_().mcpError,
      panel: TS().visible, tabs: TS().terminalTabs.length,
      paneIds: PTY.ids(),
    });
  `),
);
console.log('== DASAR ==');
console.log(J(dasar));

const PORT = Number(dasar.status?.port ?? 9222);
const TOKEN = dasar.status?.token ?? null;
console.log(`port efektif=${PORT} token=${TOKEN ? 'ada(' + TOKEN.length + ')' : 'TIDAK ADA'}`);

// ── 1. editor_open: balasan mentahnya apa? file di luar workspace?
const TMP = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Temp');
const SANDBOX = path.join(TMP, `zephyr-triage-${process.pid}`);
fs.rmSync(SANDBOX, { recursive: true, force: true });
fs.mkdirSync(SANDBOX, { recursive: true });
const FILE = path.join(SANDBOX, 'dari-mcp.txt');
fs.writeFileSync(FILE, 'baris satu dari disk\nbaris dua\n');

console.log('\n== 1. editor_open ==');
console.log('file: ' + FILE);
const eo = await rpc(PORT, 'editor_open', { path: FILE }, TOKEN, 8);
console.log(J(eo));

const setelahBuka = JSON.parse(
  await cdp.runAsync(`
    const t = s.tabs.slice(-1)[0];
    return JSON.stringify({
      jumlahTab: s.tabs.length,
      tabTerakhir: t ? { id: t.id, path: t.path, name: t.name, unsaved: t.unsaved } : null,
      activeTabId: s.activeTabId,
      // Semua kandidat selektor tab bar yang mungkin dipakai komponennya.
      selTestidTab: document.querySelectorAll('[data-testid="tab"]').length,
      selDotTab: document.querySelectorAll('.tab').length,
      selRoleTab: document.querySelectorAll('[role="tab"]').length,
      selTabBar: !!document.querySelector('[data-testid="tab-bar"], .tab-bar, .tabs'),
      judulTab: [...document.querySelectorAll('[role="tab"], .tab, [data-testid="tab"]')].map(e => (e.textContent||'').trim()).slice(0, 8),
      adaEditor: !!document.querySelector('.cm-editor'),
      settingsTertutup: s.settingsOpen === false,
    });
  `),
);
console.log(J(setelahBuka));

const tabId = eo.body?.result?.tabId;
const editors = await rpc(PORT, 'list_editors', {}, TOKEN, 9);
console.log('list_editors: ' + J(editors));

// ── 2. editor_insert: dirty + dot
console.log('\n== 2. editor_insert ==');
const ins = await rpc(PORT, 'editor_insert', { tabId, text: 'DISISIPKAN-OLEH-MCP\n', at: 0 }, TOKEN, 10);
console.log('insert: ' + J(ins));
const stInsert = JSON.parse(
  await cdp.runAsync(`
    const tab = s.tabs.find(t => t.id === ${J(tabId)});
    return JSON.stringify({
      isi: tab?.content ?? null, unsaved: tab?.unsaved,
      dotTestid: document.querySelectorAll('[data-testid="tab-dot"]').length,
      dotKelas: document.querySelectorAll('.tab-dot').length,
      dotUnsaved: document.querySelectorAll('[class*="unsaved"], [class*="dirty"]').length,
      cm: (window.__ZEPHYR_CM__()?.state.doc.toString() ?? null)?.slice(0, 60),
    });
  `),
);
console.log(J(stInsert));

// ── 3. PTY: pane mana yang punya handle xterm?
console.log('\n== 3. PTY / xterm ==');
const pty = JSON.parse(
  await cdp.runAsync(`
    const ids = PTY.ids();
    const ts = TS();
    return JSON.stringify({
      ids,
      panjang: ids.map(id => ({ id, n: (PTY.read(id, 200) ?? '').length })),
      visible: ts.visible,
      tabs: ts.terminalTabs.map(t => ({ id: t.id, aktif: t.activePaneId ?? null, panes: t.panes.map(p => ({ id: p.id, jenis: p.type, status: p.status })) })),
      listPty: (PTY.list() ?? []).map(p => ({ paneId: p.paneId, running: p.running, pid: p.pid })),
      domXterm: document.querySelectorAll('.xterm').length,
    });
  `),
);
console.log(J(pty));

// tulis ke pane pertama (kalau ada) lalu baca ulang
const panePertama = dasar.paneIds?.[0];
if (panePertama) {
  const marker = `TRIAGE-${Date.now().toString(36)}`;
  const w = await rpc(PORT, 'terminal_write', { paneId: panePertama, data: `echo ${marker}` }, TOKEN, 40);
  const k = await rpc(PORT, 'terminal_key', { paneId: panePertama, key: 'Enter' }, TOKEN, 41);
  console.log('write: ' + J(w) + ' key: ' + J(k));
  await new Promise((r) => setTimeout(r, 2200));
  const baca = JSON.parse(
    await cdp.runAsync(`
      const teks = PTY.read(${J(panePertama)}, 60) ?? '';
      return JSON.stringify({ panjang: teks.length, ekor: teks.slice(-200), adaMarker: teks.includes(${J(marker)}) });
    `),
  );
  console.log('baca ulang: ' + J(baca));
}

// ── 4. run_command tidak dikenal + panel served
console.log('\n== 4. run_command ==');
console.log('tidak.ada: ' + J(await rpc(PORT, 'run_command', { id: 'tidak.ada' }, TOKEN, 15)));
const v7 = JSON.parse(
  await cdp.runAsync(`
    const MS_ = () => M.store.getState();
    return JSON.stringify({ served: MS_().served, lastAction: MS_().lastAction?.type ?? null, panel: TS().visible });
  `),
);
console.log('store: ' + J(v7));

// ── 5. badge registry + list_extensions
console.log('\n== 5. badge/openCode + extensions ==');
const badge = JSON.parse(
  await cdp.runAsync(`
    const MS_ = () => M.store.getState();
    await M.refreshClis();
    const el = document.querySelector('[data-testid="mcp-reg-opencode"]');
    return JSON.stringify({ ada: !!el, teks: el?.textContent?.trim() ?? null, semuaReg: [...document.querySelectorAll('[data-testid^="mcp-reg-"]')].map(e => e.getAttribute('data-testid') + '=' + (e.textContent||'').trim()), lastWrite: MS_().lastWrite });
  `),
);
console.log(J(badge));
console.log('list_extensions: ' + J((await rpc(PORT, 'list_extensions', {}, TOKEN, 36)).body?.result?.length ?? null));

fs.rmSync(SANDBOX, { recursive: true, force: true });
try {
  cdp.close();
} catch {
  /* tidak apa-apa */
}
console.log('\nSELESAI-TRIAGE');
