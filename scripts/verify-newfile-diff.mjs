/*
 * D1..D3 — a NEW file produces a diff.
 *
 * The bug this pins: `write_file` skipped the diff whenever the file did not
 * already exist (`lama ? buatDiff(...) : ''`), on the reasoning that a new file
 * has "nothing useful to compare". A live run showed what that costs — three
 * brand-new files produced ZERO diffs, so the reader saw no line of what was
 * written, even though creating a file is the clearest change there is.
 *
 * Tested through the real tool, not `buatDiff` alone: the function always
 * handled the empty case, and the regression was in the CALLER's decision to
 * skip it.
 *
 * Run: node scripts/verify-newfile-diff.mjs
 */
import { WebSocket } from 'ws';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const pg = list.find((x) => x.type === 'page');
if (!pg) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(pg.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));
let id = 0;
const pend = new Map();
ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
  if (r?.exceptionDetails) return null;
  return r?.result?.value;
};
await send('Runtime.enable');

const out = [];
const check = (i, ok, d) => { out.push(ok); console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${i.padEnd(4)} ${d}`); };

/* Forward slashes only: this path is embedded into JS source for the page. */
const sandbox = `${tmpdir()}/zephyr-diff-${process.pid}`.replaceAll('\\', '/');
mkdirSync(sandbox, { recursive: true });
const target = `${sandbox}/baru.txt`;

/* Open the sandbox as the workspace so the write is allowed, then write a file
   that does NOT exist yet — the exact case that lost its diff. */
await ev(`window.__ZEPHYR_CTL = 1; 1`);
const run = async (body) => {
  const slot = '__NF' + Math.random().toString(36).slice(2, 7);
  await ev(`window.${slot}=null;(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;window.${slot}={done:true,value:(await (async()=>{${body}})())};})().catch(e=>window.${slot}={done:true,error:String((e&&e.message)||e)});'go'`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const raw = await ev(`window.${slot}?JSON.stringify(window.${slot}):null`);
    if (!raw) continue;
    const st = JSON.parse(raw);
    if (st.done) { if (st.error) throw new Error(st.error); return st.value; }
  }
  throw new Error('timeout');
};

await run(`return await invoke('workspace_open',{path:${JSON.stringify(sandbox)}});`);
await new Promise((r) => setTimeout(r, 800));

const isi = 'baris satu\nbaris dua\nbaris tiga';
const hasil = await run(`
  const m = await import('/src/lib/zephyrTools/builtins.ts?v=' + Date.now());
  const t = m.TOOL_BAWAAN.find(x => x.spec.name === 'write_file');
  return await t.run({ path: ${JSON.stringify(target)}, content: ${JSON.stringify(isi)} });
`);

// D1 — the file really was created.
await new Promise((r) => setTimeout(r, 400));
check('D1', existsSync(target), `berkas baru dibuat: ${existsSync(target)}`);

// D2 — and its result carries a diff.
const adaDiff = typeof hasil === 'string' && /(^|\n)@@/.test(hasil);
check('D2', adaDiff, adaDiff ? `hasil memuat hunk diff` : `TIDAK ada diff: ${String(hasil).slice(0, 120)}`);

// D3 — the added lines are shown as additions, so the reader sees the content.
const tambah = typeof hasil === 'string' ? (hasil.match(/^\+/gm) || []).length : 0;
check('D3', tambah >= 3, `${tambah} baris ditandai sebagai tambahan`);

try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* locked */ }
ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
