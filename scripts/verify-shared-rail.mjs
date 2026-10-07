/*
 * R1..R4 — the connector rail exists in BOTH transcripts.
 *
 * A rail is a pseudo-element, so its presence cannot be seen in a screenshot
 * reliably and cannot be found by querySelector. It is checked through
 * getComputedStyle, and the rail's own offset is read too: the node dots used to
 * reference `--rail-x`, which was declared only on the CLI container, so Chat
 * AI's dots resolved to `auto` and sat in the wrong place beside a line that did
 * not exist.
 *
 * Run: node scripts/verify-shared-rail.mjs
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

/* Seed a tool row into each transcript so both rails have something to draw. */
console.log('seed CLI:', await ev(`
(()=>{const S=window.__ZEPHYR_CLICHAT__; const st=S.getState(); const aid='claude';
const sid=st.activeId[aid]||(st.sessions[aid][0]&&st.sessions[aid][0].id);
const parts=[{type:'tool',callId:'rail1',name:'Read',title:'src/a.ts',output:'x',status:'ok'},
             {type:'tool',callId:'rail2',name:'Edit',title:'src/a.ts',status:'ok',diffOld:'a',diffNew:'b'}];
S.setState((s0)=>({sessions:{...s0.sessions,[aid]:s0.sessions[aid].map(x=>x.id===sid?{...x,messages:[{id:'rail',role:'assistant',content:'ok',parts}]}:x)}}));
window.__RAILSID=sid; return 'ok';})()
`));
await new Promise((r) => setTimeout(r, 900));

/* The CLI timeline mounts only while its tab is selected; without this the
   check reports the rail missing when the panel is simply showing Chat AI. */
await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 1000));

const cli = await ev(`(()=>{
  const t=document.querySelector('[data-testid="cli-timeline"]');
  if(!t) return 'no-cli-timeline';
  const cs=getComputedStyle(t,'::before');
  const row=t.querySelector('.cli-tool');
  const h=row?getComputedStyle(row.querySelector('.cli-tool-head')):null;
  return JSON.stringify({line:cs.content, w:cs.width, x:getComputedStyle(t).getPropertyValue('--rail-x').trim(), pad:h?h.paddingLeft:null});
})()`);
const c = typeof cli === 'string' && cli.startsWith('{') ? JSON.parse(cli) : null;
check('R1', Boolean(c) && c.line === '""' && c.w === '2px', `CLI rail: ${cli}`);
check('R2', Boolean(c) && c.x === '17px' && c.pad === '30px', `CLI node/indent: --rail-x=${c?.x} pad=${c?.pad}`);

/* The attribute is what both wrappers share; proving it is on Chat AI's wrapper
   is what proves the selector can reach it. */
const chat = await ev(`(()=>{
  const t=document.querySelector('[data-testid="ai-toolruns"]');
  if(!t) return 'no-ai-toolruns';
  const has=t.hasAttribute('data-timeline');
  const cs=getComputedStyle(t,'::before');
  const row=t.querySelector('.cli-tool');
  const h=row?getComputedStyle(row.querySelector('.cli-tool-head')):null;
  return JSON.stringify({attr:has, line:cs.content, w:cs.width, pad:h?h.paddingLeft:null,
    x:getComputedStyle(t).getPropertyValue('--rail-x').trim()});
})()`);
const a = typeof chat === 'string' && chat.startsWith('{') ? JSON.parse(chat) : null;
check('R3', Boolean(a) && a.attr && a.line === '""' && a.w === '2px', `Chat AI rail: ${chat}`);
check('R4', Boolean(a) && a.x === '17px' && a.pad === '30px', `Chat AI node/indent: --rail-x=${a?.x} pad=${a?.pad}`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
