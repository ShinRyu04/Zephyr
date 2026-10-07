import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const pg = list.find((x) => x.type === 'page');
const ws = new WebSocket(pg.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.on('open', r));
let id = 0;
/* Register the waiter BEFORE sending: filling the map after ws.send lets a fast
   reply land with no handler attached, and the promise then never resolves. */
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
await send('Page.enable');

const patch = ['--- a/sample.txt','+++ b/sample.txt','@@ -1,2 +1,2 @@',' alpha','-beta','+BETA'].join('\n');
const parts = [
  { type: 'thinking', text: 'Saya perlu membaca file dulu lalu mengeditnya.' },
  { type: 'tool', callId: 't1', name: 'Read', title: 'src/sample.txt', output: 'alpha\nbeta', status: 'ok', exitCode: 0 },
  { type: 'text', text: 'File dibaca, sekarang saya edit.' },
  { type: 'tool', callId: 't2', name: 'Edit', title: 'src/sample.txt', status: 'ok', exitCode: 0, diffOld: 'alpha\nbeta', diffNew: 'alpha\nBETA' },
  { type: 'tool', callId: 't3', name: 'Bash', title: 'npm test', output: 'ok 12 tests', status: 'ok', exitCode: 0 },
  { type: 'error', text: 'Uji gagal di file kedua' },
];
console.log('store:', await ev(`typeof (window.__ZEPHYR_CLICHAT__||{}).getState`));
console.log('inject:', await ev(`
(() => {
  const S = window.__ZEPHYR_CLICHAT__;
  if (!S || !S.getState) return 'no-store';
  const st = S.getState();
  /* sessions is keyed by agent: { claude: [...], codex: [...] } */
  const sid = (st.activeId && st.activeId.claude) || (st.sessions.claude && st.sessions.claude[0] && st.sessions.claude[0].id);
  const msgs = [{ id: 'rail-1', role: 'assistant', at: 1, content: 'Jawaban: selesai.', parts: ${JSON.stringify(parts)} }];
  S.setState((s0) => ({ sessions: { ...s0.sessions, claude: s0.sessions.claude.map((x) => x.id === sid ? { ...x, messages: msgs } : x) } }));
  return 'ok ' + sid;
})()
`));
/* Bring the Claude Code tab forward: the timeline only mounts when that
   session is the visible one, so injecting into a background session renders
   nothing and the screenshot would show an empty panel. */
await ev(`(()=>{const H=window.__ZEPHYR_PANEL__; if(H&&H.getState){const p=H.getState(); if(p.focusTab) p.focusTab('ai');} return 1;})()`);
await new Promise(x => setTimeout(x, 900));
await ev(`(()=>{const t=document.querySelector('[data-testid="cli-tab-claude"], [data-cli-agent="claude"]'); if(t) t.click(); return 1;})()`);
await new Promise(x => setTimeout(x, 1400));
console.log('dom:', await ev(`JSON.stringify({tools: document.querySelectorAll('.cli-tool').length, timeline: document.querySelectorAll('.cli-timeline').length})`));
await ev(`(()=>{const t=document.querySelector('.cli-timeline'); if(t) t.scrollIntoView({block:'center'}); return 1;})()`);
await new Promise(x => setTimeout(x, 800));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('scripts/_rail.png', Buffer.from(shot.result.data, 'base64'));
console.log('saved');
ws.close();
