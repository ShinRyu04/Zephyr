/*
 * K1..K3 — scanning a third-party repo for skills.
 *
 * Reads a REAL repository over the network, because the whole feature is
 * "reach the skills that are not bundled" and a fixture would prove the parsing
 * while saying nothing about whether the API path and response shape are right.
 * claude-red is the repo the user named.
 *
 * Run: node scripts/verify-repo-scan.mjs
 */
import { WebSocket } from 'ws';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const pg = list.find((x) => x.type === 'page');
if (!pg) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(pg.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));
let id = 0;
const send = (m, p = {}) => new Promise((res) => {
  const i = ++id;
  const h = (raw) => { const j = JSON.parse(raw); if (j.id === i) { ws.off('message', h); res(j); } };
  ws.on('message', h);
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
  if (r.result?.exceptionDetails) return 'THREW: ' + (r.result.exceptionDetails.exception?.description || '');
  return r.result?.result?.value;
};
await send('Runtime.enable');

const out = [];
const check = (i, ok, d) => { out.push(ok); console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${i.padEnd(4)} ${d}`); };

const run = async (body, tries = 90) => {
  const slot = '__RK' + Math.random().toString(36).slice(2, 7);
  /*
   * Read `.message` inside the page, not String(e).
   *
   * Tauri rejects with a structured object, so String(e) yields the literal
   * "[object Object]" and the reason is lost before it ever leaves the webview.
   */
  await ev(`window.${slot}=null;(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;window.${slot}={done:true,value:(await (async()=>{${body}})())};})().catch(e=>window.${slot}={done:true,error:String((e&&e.message)||e)});'go'`);
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const raw = await ev(`window.${slot}?JSON.stringify(window.${slot}):null`);
    if (!raw) continue;
    const st = JSON.parse(raw);
    if (st.done) { if (st.error) throw new Error(st.error); return st.value; }
  }
  throw new Error('timeout');
};

// K1 — a name with no owner/repo is refused before any request is made.
// The rejection is synchronous in Rust but still crosses the IPC bridge, so it
// needs the same polling budget as any other call: a short budget produced a
// bare "timeout" here, which read as the guard missing when it had fired.
let refused = false;
try {
  await run(`return await invoke('cc_repo_scan',{repo:'not-a-repo'});`, 40);
} catch (e) {
  /*
   * Tauri rejects with a STRUCTURED object, not an Error — `String(e)` gives
   * "[object Object]" and the reason is invisible. Reading `.message` is what
   * makes the assertion about the guard rather than about how the bridge
   * serialises a rejection.
   */
  const pesan = String((e && e.message) || e);
  console.log(`   (K1 raw error: ${JSON.stringify(pesan)})`);
  refused = pesan.includes('owner/repo');
}
check('K1', refused, `bad repo rejected: ${refused ? 'clear reason' : 'NO clear reason'}`);

// K2 — the real repo scans and yields skills with bodies.
try {
  const raw = await run(`const e = await invoke('cc_repo_scan',{repo:'SnailSploit/claude-red'}); return JSON.stringify({n:e.length, sample:e[0]?{name:e[0].name,kind:e[0].kind,title:e[0].title,bodyLen:e[0].body.length}:null});`);
  const j = JSON.parse(raw);
  check('K2', j.n > 0, `scanned ${j.n} entries; sample=${JSON.stringify(j.sample)}`);
} catch (e) {
  check('K2', false, `scan failed: ${e}`);
}

// K3 — every entry carries a body, so the preview needs no second request.
const shape = await run(`const e = await invoke('cc_repo_scan',{repo:'SnailSploit/claude-red'});
  const noBody = e.filter(x => !x.body || x.body.length < 10).length;
  const noName = e.filter(x => !x.name).length;
  const kinds = [...new Set(e.map(x => x.kind))].join(',');
  return JSON.stringify({total:e.length, noBody, noName, kinds});`);
const s3 = JSON.parse(shape);
check('K3', s3.noBody === 0 && s3.noName === 0, `total=${s3.total} withoutBody=${s3.noBody} withoutName=${s3.noName} kinds=${s3.kinds}`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
