/*
 * Live view of one agent run, printing only what CHANGED.
 *
 * A line per poll ("… bekerja") reads as progress but carries none: the run
 * spends most of its time waiting on the model, and printing that every few
 * seconds buries the three events that matter — a tool landing, an error, and
 * the run ending. This prints those and nothing else.
 *
 * The history size is the number to watch for a 502: the request grows with
 * every result that stays in the conversation, so knowing which call pushed it
 * past the gateway's limit is what makes the failure actionable.
 *
 * Usage: node scripts/watch-run.mjs   (while a run is in progress)
 */
import WebSocket from 'ws';

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

/* `.store` is a FUNCTION on this bridge, not the store itself. */
const probe = `(()=>{try{
  const B=window.__ZEPHYR_AI__; if(!B) return null;
  const st=B.store.getState();
  const m=(st.activeSession()||{}).messages||[];
  const tools=[]; for(const x of m) for(const p of (x.tools||[])) tools.push(p.name+(p.ok?'':'!'));
  const last=[...m].reverse().find(x=>x.role==='assistant');
  let chars=0; try { chars=JSON.stringify(m).length; } catch(e) {}
  return JSON.stringify({tools, busy:!!st.agentBusy, streaming:!!(last&&last.streaming),
    err:(last&&last.error)||'', answer:((last&&last.content)||'').length, chars});
}catch(e){ return null; }})()`;

let seen = 0, lastErr = '', t0 = Date.now();
for (let i = 0; i < 900; i++) {
  const s = await ev(probe);
  if (s) {
    const j = JSON.parse(s);
    while (seen < j.tools.length) {
      const secs = Math.round((Date.now() - t0) / 1000);
      console.log(`[${secs}s] tool #${seen + 1}: ${j.tools[seen]}  (riwayat ${(j.chars/1024).toFixed(1)}KB)`);
      seen++;
    }
    if (j.err && j.err !== lastErr) { lastErr = j.err; console.log(`ERROR: ${j.err.slice(0,300)}`); }
    if (seen > 0 && !j.busy && !j.streaming) {
      console.log(`SELESAI: ${seen} tool, riwayat ${(j.chars/1024).toFixed(1)}KB, jawaban ${j.answer} char`);
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 3000));
}
ws.close();
