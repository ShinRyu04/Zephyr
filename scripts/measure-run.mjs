/*
 * Measure one live agent run: every tool call, its duration, the payload size
 * of each request, and any HTTP failure.
 *
 * The payload number is the point. A 502 from the gateway is a SIZE problem
 * before it is anything else — the request grows with every tool result that
 * stays in the conversation, so the failure arrives at a size, not at a step.
 * Knowing which step crossed what size is what turns "it just 502s" into
 * something fixable.
 *
 * Run it WHILE a run is in progress:  node scripts/measure-run.mjs
 */
import WebSocket from 'ws';

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
  if (r.result?.exceptionDetails) return null;
  return r.result?.result?.value;
};
await send('Runtime.enable');

/* The captured requests carry the payload size, host and status — never the
   body of a successful call, and never a credential. */
const probe = `(()=>{try{
  const S=window.__ZEPHYR_AI__; if(!S) return null;
  const st=S.getState(); const m=(st.activeSession()||{}).messages||[];
  const tools=[];
  for(const x of m) for(const p of (x.tools||[])) tools.push({
    name:p.name, ok:!!p.ok, ms:p.ms||null,
    insize:(typeof p.result==='string'?p.result.length:0),
    outsize:(typeof p.args==='string'?p.args.length:0),
  });
  let bytes=0; try { bytes = JSON.stringify(m).length; } catch(e) {}
  const last=[...m].reverse().find(x=>x.role==='assistant');
  return JSON.stringify({toolCount:tools.length, tools, historyChars:bytes,
    err:(last&&last.error)||'', streaming:!!(last&&last.streaming), answer:((last&&last.content)||'').length});
}catch(e){ return null; }})()`;

let seen = 0;
const t0 = Date.now();
for (let i = 0; i < 300; i++) {
  const s = await ev(probe);
  if (s) {
    const j = JSON.parse(s);
    while (seen < j.tools.length) {
      const t = j.tools[seen];
      const secs = Math.round((Date.now() - t0) / 1000);
      console.log(`[${secs}s] #${seen + 1} ${t.name.padEnd(18)} ${t.ok ? 'ok ' : 'GAGAL'} ${String(t.ms ?? '-').padStart(6)}ms  hasil=${t.insize}B`);
      seen++;
    }
    if (j.err) console.log(`❌ ERROR: ${j.err.slice(0, 300)}`);
    if (j.toolCount > 0 && !j.streaming && j.answer > 0) {
      console.log(`\n=== SELESAI: ${j.toolCount} tool, riwayat ${(j.historyChars / 1024).toFixed(1)}KB, jawaban ${j.answer} char ===`);
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
}
ws.close();
