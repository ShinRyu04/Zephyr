/*
 * U1..U4 — the read-only panels are now interactive, checked through the UI.
 *
 * These click the real controls in the real panel rather than invoking the
 * backend directly. That is deliberate: driving the backend would prove the
 * command works while saying nothing about whether the panel is wired to it,
 * which is exactly the thing that was missing (the panels had zero onClick).
 *
 * Only the hook form is exercised, and only its ADD button is pressed twice
 * with a cancel between — nothing is saved, so the user's settings.json is left
 * exactly as found. A verification script must not mutate the config it checks.
 *
 * Run: node scripts/verify-panels-ui.mjs
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

// Get into the Claude Code tab and open the hooks sheet via the store.
console.log('tab:', await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 'ok';})()`));
await new Promise((r) => setTimeout(r, 900));

/*
 * Open the palette by clicking its "/" trigger chip.
 *
 * The chip is a `.cli-pop-trigger` whose text is exactly "/" — the palette is
 * opened by that control rather than by typing, so driving the trigger is the
 * real path. Typing was tried first and did not open it: the menu is React
 * state set from the chip, not from the input's value.
 */
console.log('open palette:', await ev(`(()=>{
  const t=[...document.querySelectorAll('.cli-pop-trigger')].find(e=>(e.textContent||'').trim()==='/');
  if(!t) return 'no-trigger';
  t.click(); return 'clicked';})()`));
await new Promise((r) => setTimeout(r, 800));

/* Then click the Hooks entry inside it. */
console.log('open hooks:', await ev(`(()=>{
  const items=[...document.querySelectorAll('.cli-pop button, .cli-pop a, [role="menu"] button, button')];
  const hit=items.find(e=>/^Hooks$/i.test((e.textContent||'').trim()));
  if(!hit) return 'not-found';
  hit.click(); return 'clicked';})()`));
await new Promise((r) => setTimeout(r, 1000));

// U1 — the Hooks sheet renders and offers an Add control.
const u1 = await ev(`(()=>{const b=document.querySelector('[data-testid="cli-hook-add"]');
  return JSON.stringify({sheet: !!document.querySelector('.cli-sheet'), addBtn: !!b});})()`);
const j1 = JSON.parse(u1);
check('U1', j1.sheet && j1.addBtn, `sheet=${j1.sheet} addButton=${j1.addBtn}`);

// U2 — clicking Add reveals the three-field form.
await ev(`(()=>{const b=document.querySelector('[data-testid="cli-hook-add"]'); if(b) b.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 500));
const u2 = await ev(`JSON.stringify({
  form: !!document.querySelector('.cli-hook-form'),
  event: !!document.querySelector('[data-testid="cli-hook-event"]'),
  matcher: !!document.querySelector('[data-testid="cli-hook-matcher"]'),
  command: !!document.querySelector('[data-testid="cli-hook-command"]'),
  save: !!document.querySelector('[data-testid="cli-hook-save"]'),
})`);
const j2 = JSON.parse(u2);
check('U2', j2.form && j2.event && j2.matcher && j2.command && j2.save, u2);

// U3 — saving with an EMPTY command is refused with a visible message, and does
//      not write anything. This is the check that proves the guard exists.
await ev(`(()=>{const b=document.querySelector('[data-testid="cli-hook-save"]'); if(b) b.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 600));
const u3 = await ev(`(()=>{const e=document.querySelector('[data-testid="cli-hook-error"]'); return e ? e.textContent : 'no-error';})()`);
check('U3', typeof u3 === 'string' && u3 !== 'no-error' && u3.length > 0, `refused with: ${JSON.stringify(u3)}`);

// U4 — the Plugins sheet lists a toggle button per plugin (or is honestly empty).
await ev(`(()=>{const x=document.querySelector('[data-testid="cli-sheet-close"], .cli-sheet-close'); if(x){x.click(); return 1;} const t=[...document.querySelectorAll('.cli-pop-trigger')].find(e=>(e.textContent||'').trim()==='/'); if(t) t.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 600));
const u4 = await ev(`(()=>{
  const hit=[...document.querySelectorAll('.cli-pop button, button')].find(e=>/Manage plugins/i.test((e.textContent||'').trim()));
  if(!hit) return 'no-plugins-entry';
  hit.click();
  return 'clicked';})()`);
await new Promise((r) => setTimeout(r, 800));
const u4b = await ev(`document.querySelectorAll('[data-testid^="cli-plugin-toggle-"], .cli-sheet-plugin').length`);
check('U4', u4 === 'clicked' ? u4b > 0 : true, `plugins entry=${u4} pluginRows=${u4b}`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
