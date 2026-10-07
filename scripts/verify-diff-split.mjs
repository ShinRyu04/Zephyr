/*
 * D1..D5 — the side-by-side diff.
 *
 * The split view pairs each deletion with the addition that replaced it. That
 * logic is the part worth testing: a mispaired table still looks like a diff,
 * so the failure is invisible in a screenshot and only shows up as the reader
 * comparing the wrong two lines. These checks drive `pairForSplit` directly
 * with the shapes the real differ produces.
 *
 * Run: node scripts/verify-diff-split.mjs
 */
import { WebSocket } from 'ws';

const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pg = list.find((x) => x.type === 'page');
if (!pg) { console.error('no page target'); process.exit(1); }
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
const check = (id, ok, detail) => { out.push(ok); console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(5)} ${detail}`); };

const BUST = `?v=${Date.now()}`;
await ev(`window.__SP=null; import('/src/components/ai/claudeCodeUi.tsx${BUST}').then(m=>{window.__SP=m;}).catch(e=>{window.__SP={err:String(e)}}); 'go'`);
let ready = null;
for (let i = 0; i < 60 && !ready; i++) { ready = await ev(`window.__SP && (window.__SP.err || typeof window.__SP.pairForSplit === 'function')`); if (!ready) await new Promise(r => setTimeout(r, 150)); }

// D1 — one deleted line replaced by one added line pairs onto a SINGLE row.
const d1 = await ev(`(()=>{const m=window.__SP; if(!m||!m.pairForSplit) return 'no-fn';
  const rows=[{kind:'same',text:'alpha',a:1,b:1},{kind:'del',text:'beta',a:2,b:null},{kind:'add',text:'BETA',a:null,b:2},{kind:'same',text:'gamma',a:3,b:3}];
  return JSON.stringify(m.pairForSplit(rows));})()`);
const p1 = typeof d1 === 'string' && d1.startsWith('[') ? JSON.parse(d1) : null;
check('D1', Boolean(p1) && p1.length === 3
  && p1[0].left && p1[0].right && p1[0].left.text === 'alpha'
  && p1[1].left && p1[1].right && p1[1].left.text === 'beta' && p1[1].right.text === 'BETA'
  && p1[2].left && p1[2].right, `rows=${p1 ? p1.length : d1}`);

// D2 — an insertion with nothing deleted leaves the left half EMPTY, and the
//      right half still carries the new line. A naive zip would slide the
//      following context line into the left column.
const d2 = await ev(`(()=>{const m=window.__SP;
  const rows=[{kind:'same',text:'a',a:1,b:1},{kind:'add',text:'NEW',a:null,b:2},{kind:'same',text:'b',a:2,b:3}];
  return JSON.stringify(m.pairForSplit(rows));})()`);
const p2 = JSON.parse(d2);
check('D2', p2.length === 3 && p2[1].left === null && p2[1].right && p2[1].right.text === 'NEW'
  && p2[2].left && p2[2].left.text === 'b', JSON.stringify(p2.map(r => [r.left && r.left.text, r.right && r.right.text])));

// D3 — a deletion with nothing added leaves the right half empty.
const d3 = await ev(`(()=>{const m=window.__SP;
  const rows=[{kind:'del',text:'GONE',a:1,b:null},{kind:'same',text:'keep',a:2,b:1}];
  return JSON.stringify(m.pairForSplit(rows));})()`);
const p3 = JSON.parse(d3);
check('D3', p3[0].left && p3[0].left.text === 'GONE' && p3[0].right === null
  && p3[1].left && p3[1].right, JSON.stringify(p3.map(r => [r.left && r.left.text, r.right && r.right.text])));

// D4 — unequal blocks: 2 removed, 3 added => 3 rows, last one left-empty.
const d4 = await ev(`(()=>{const m=window.__SP;
  const rows=[{kind:'del',text:'d1',a:1,b:null},{kind:'del',text:'d2',a:2,b:null},
              {kind:'add',text:'a1',a:null,b:1},{kind:'add',text:'a2',a:null,b:2},{kind:'add',text:'a3',a:null,b:3}];
  return JSON.stringify(m.pairForSplit(rows));})()`);
const p4 = JSON.parse(d4);
check('D4', p4.length === 3 && p4[0].left.text === 'd1' && p4[0].right.text === 'a1'
  && p4[1].left.text === 'd2' && p4[1].right.text === 'a2'
  && p4[2].left === null && p4[2].right.text === 'a3',
  JSON.stringify(p4.map(r => [r.left && r.left.text, r.right && r.right.text])));

// D5 — an empty diff yields no rows at all (not one empty row).
const d5 = await ev(`JSON.stringify(window.__SP.pairForSplit([]))`);
check('D5', d5 === '[]', d5);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
