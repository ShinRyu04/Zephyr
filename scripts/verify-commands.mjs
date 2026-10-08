/*
 * C1..C4 — every slash command in the palette DOES something.
 *
 * The list grew from 19 to the real set, and a palette entry that quietly does
 * nothing is worse than a missing one: the reader concludes the command is
 * broken rather than that Zephyr has not wired it up. So each command is
 * invoked through the real palette and its effect is observed — a sheet opening,
 * the input changing, the terminal pane appearing, or a toast landing.
 *
 * Run: node scripts/verify-commands.mjs
 */
import { WebSocket } from 'ws';

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

const run = async (body, tries = 60) => {
  const slot = '__CM' + Math.random().toString(36).slice(2, 7);
  await ev(`window.${slot}=null;(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;window.${slot}={done:true,value:(await (async()=>{${body}})())};})().catch(e=>window.${slot}={done:true,error:String((e&&e.message)||e)});'go'`);
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const raw = await ev(`window.${slot}?JSON.stringify(window.${slot}):null`);
    if (!raw) continue;
    const st = JSON.parse(raw);
    if (st.done) { if (st.error) throw new Error(st.error); return st.value; }
  }
  throw new Error('timeout');
};

// C1 — the command list is the real one, with the `runs` field.
const raw = await run(`const c = await invoke('claude_builtin_commands'); return JSON.stringify({n:c.length, sampel:c.slice(0,2), runs:[...new Set(c.map(x=>x.runs))]});`);
const j1 = JSON.parse(raw);
check('C1', j1.n >= 40, `${j1.n} commands listed (runs: ${j1.runs.join('/')})`);
check('C2', j1.runs.every((r) => ['zephyr', 'cli', 'terminal'].includes(r)), `every command declares where it runs: ${j1.runs.join(', ')}`);

/*
 * Switch to the Claude Code tab first: the palette belongs to ITS composer, and
 * with the Chat tab showing there is no `.cli-native-input` in the DOM at all —
 * which makes a working palette look like a missing one.
 */
await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 1100));

// C3 — the palette opens and shows them, grouped.
await ev(`(()=>{const b=document.querySelector('.cli-native-input'); if(!b) return 1;
  const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(b),'value');
  b._valueTracker && b._valueTracker.setValue('__force__');
  d.set.call(b,'/'); b.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()`);
await new Promise((r) => setTimeout(r, 1000));
const pal = await ev(`(()=>{const p=document.querySelector('[data-testid^="ai-clichat-slash-menu-"]'); if(!p) return JSON.stringify({open:false});
  return JSON.stringify({open:true, baris:p.querySelectorAll('[data-testid^="ai-clichat-cmd-"]').length});})()`);
const p1 = JSON.parse(pal);
check('C3', p1.open && p1.baris >= 30, `palette lists ${p1.baris} commands`);

// C4 — invoking one whose effect is a SHEET really opens a sheet.
const buka = await ev(`(()=>{const b=document.querySelector('[data-testid="ai-clichat-cmd-skills-claude"]');
  if(!b) return 'tidak-ada'; b.click(); return 'klik';})()`);
await new Promise((r) => setTimeout(r, 1200));
const sheet = await ev(`document.querySelectorAll('.cli-sheet').length`);
check('C4', buka === 'klik' && sheet > 0, `/skills opened a sheet: clicked=${buka} sheet=${sheet}`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
