/*
 * R1..R3 — the CLI's session id is captured and reused.
 *
 * Two separate links have to hold, and each can fail silently:
 *   1. the backend must relay the id from the init line, and
 *   2. the store must feed it back as `--resume` on the NEXT prompt.
 * A single live run proves both: ask it to remember something, then ask for it
 * back. If either link is broken the second answer will not know the name.
 *
 * Costs two real agent runs (~60s), so it lives outside the fast suite.
 *
 * Run: node scripts/verify-resume.mjs
 */
import { WebSocket } from 'ws';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
/* Dua jendela bisa hidup bersamaan (`/` dan `/index.html#agents`) dan urutan
 * `/json/list` tidak dijamin, jadi `find(type==='page')` bisa mendarat di
 * jendela Agents yang tidak punya tab Claude Code. Pilih target utama eksplisit. */
const pg =
  list.find((x) => x.type === 'page' && !x.url.includes('#') && new URL(x.url).pathname === '/') ??
  list.find((x) => x.type === 'page' && !x.url.includes('#')) ??
  list.find((x) => x.type === 'page');
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

/* The agent is asked to write files, so it works in a throwaway directory. */
/* Forward slashes only: the path is embedded into JS source that runs in the
   page, where a Windows backslash would be read as an escape. */
const sandbox = `${tmpdir()}/zephyr-resume-${process.pid}`.replaceAll('\\', '/');
mkdirSync(sandbox, { recursive: true });

/*
 * This harness talks to the REAL Claude Code tab, so it must leave no trace:
 * no test session, no test messages, and the Agent tab back in front. Without
 * this, the user opens Claude Code later and finds the BAMBU prompts from this
 * test sitting in their history (reported 2 Nov).
 */
const sebelum = await ev(`JSON.stringify((()=>{const st=window.__ZEPHYR_CLICHAT__.getState();
  return { sessions: st.sessions, activeId: st.activeId };})())`);

console.log('tab:', await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 'ok';})()`));
await new Promise((r) => setTimeout(r, 800));

// Turn 1 — state a fact and ask it to write a file, so a real session starts.
console.log('turn1:', await ev(`
(()=>{const S=window.__ZEPHYR_CLICHAT__; const st=S.getState();
  if (st.newSession) { try { st.newSession('claude'); } catch(e){} }
  S.getState().send('claude', 'Catat fakta ini: kata sandinya adalah BAMBU. Buat berkas catatan.txt di folder ini berisi kata itu.', { cwd: ${JSON.stringify(sandbox)} });
  window.__WATCH = S.getState().activeId.claude;
  return 'sent to ' + window.__WATCH;})()
`));

// Wait for the run to finish (pending cleared) and the id to be stored.
let sid = null;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await ev(`(()=>{const st=window.__ZEPHYR_CLICHAT__.getState();
    const sess=(st.sessions.claude||[]).find(x=>x.id===window.__WATCH);
    if(!sess) return null;
    return JSON.stringify({pending: sess.pending, sid: sess.cliSessionId||null});})()`);
  if (!s) continue;
  const j = JSON.parse(s);
  if (j.sid) sid = j.sid;
  if (j.sid && !j.pending) break;
}
check('R1', Boolean(sid), sid ? `session id captured: ${sid.slice(0, 18)}…` : 'no cliSessionId after turn 1');

// Turn 2 — ask for the fact back. Only a resumed session can answer it.
console.log('turn2:', await ev(`(()=>{const S=window.__ZEPHYR_CLICHAT__; S.getState().send('claude', 'Apa kata sandi yang saya sebut tadi? Jawab satu kata saja.'); return 'sent';})()`));

let answer = '';
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await ev(`(()=>{const st=window.__ZEPHYR_CLICHAT__.getState();
    const sess=(st.sessions.claude||[]).find(x=>x.id===window.__WATCH);
    if(!sess) return null;
    const last=[...sess.messages].reverse().find(m=>m.role==='assistant');
    return JSON.stringify({pending: sess.pending, text: (last&&last.content)||''});})()`);
  if (!s) continue;
  const j = JSON.parse(s);
  if (!j.pending && j.text) { answer = j.text; break; }
}
check('R2', answer.length > 0, answer ? `answered: ${JSON.stringify(answer.slice(0, 80))}` : 'no answer after turn 2');
/* The whole feature in one assertion: a fresh session cannot know the word. */
check('R3', /BAMBU/i.test(answer), `remembered across turns: ${/BAMBU/i.test(answer)}`);

/* Put the Claude Code tab back exactly as it was before this test. */
let sesiAwal = { sessions: {}, activeId: {} };
try { sesiAwal = JSON.parse(sebelum); } catch (e) { /* bridge hilang: tidak ada yang perlu dipulihkan */ }
const pulih = await ev(`(()=>{const S=window.__ZEPHYR_CLICHAT__; const s=${JSON.stringify(sesiAwal)};
  S.setState({ sessions: s.sessions, activeId: s.activeId });
  try { localStorage.setItem('zephyr.aiCliSessions.v1', JSON.stringify({ sessions: s.sessions, activeId: s.activeId })); } catch (e) {}
  const tab = document.querySelector('[data-testid="ai-host-tab-chat"]');
  if (tab) tab.click();
  return 'dipulihkan';})()`);
console.log('cleanup:', pulih);

try {
  rmSync(sandbox, { recursive: true, force: true });
} catch (e) {
  console.log(`(catatan: folder sementara belum bisa dihapus: ${e.code ?? e})`);
}
ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
