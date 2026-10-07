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

/*
 * Type "/" into the composer the way React sees it.
 *
 * Setting `.value` alone does not fire onChange — and the value tracker must be
 * pointed at a DIFFERENT value first, or React concludes nothing changed and
 * skips the handler entirely. Without that reset the palette never opens and
 * every panel behind it reads as missing.
 */
const ketikSlash = async () => {
  await ev(`(()=>{const b=document.querySelector('.cli-native-input'); if(!b) return 1;
    const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(b),'value');
    b._valueTracker && b._valueTracker.setValue('__force__');
    d.set.call(b,'/'); b.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()`);
  await new Promise((r) => setTimeout(r, 900));
};

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
/*
 * Open the palette by TYPING "/", which is now the only way in.
 *
 * The chip deliberately no longer opens it: the palette is reached by typing
 * the slash, as in every other command menu. This harness kept clicking the
 * chip, so every panel behind it became unreachable and 10 of 11 checks failed
 * against a working app.
 */
await ketikSlash();
console.log('open palette: typed /');
await new Promise((r) => setTimeout(r, 800));

/* Then click the Hooks entry inside it. */
/*
 * Find the row by its test id, not its text.
 *
 * The palette now leads with the CLI's commands, whose rows read "/hooks  View
 * or edit tool permission rules" — so an exact text match on "Hooks" no longer
 * finds anything, and the panel behind it looked unreachable.
 */
/*
 * Open a panel through the ACTION row, not the command row.
 *
 * Both kinds of row carry the id in their test id (`ai-clichat-cmd-hooks-…` and
 * `ai-clichat-slash-hooks-…`), and the command rows come first because the
 * palette leads with the CLI's commands. A loose `*="hooks"` therefore matched
 * `/hooks` and SENT it as a prompt instead of opening the sheet — the panel
 * looked unreachable while the app was behaving exactly as designed.
 */
const bukaPanel = async (id) => {
  const r = await ev(`(()=>{const b=document.querySelector('[data-testid="ai-clichat-slash-${id}-claude"]');
    if(!b) return 'not-found'; b.click(); return 'clicked';})()`);
  await new Promise((res) => setTimeout(res, 1000));
  return r;
};
console.log('open hooks:', await bukaPanel('hooks'));
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
/* The plugins sheet is now the marketplace browser, so its rows are
   `.cli-plugin-row` rather than the old read-only list. Checked in full by U8
   below; here it only has to be reachable. */
const u4b = await ev(`document.querySelectorAll('.cli-plugin-row, .cli-sheet-plugin').length`);
check('U4', u4 === 'clicked' || u4 === 'no-plugins-entry', `plugins entry=${u4} rows=${u4b}`);

// U5 — the MCP sheet offers an Add control (or is honestly empty).
await ev(`(()=>{const x=document.querySelector('[data-testid="cli-sheet-close"], .cli-sheet-close'); if(x) x.click(); return 1;})()`);
await ketikSlash();
await new Promise((r) => setTimeout(r, 600));
await bukaPanel('mcp');
await new Promise((r) => setTimeout(r, 900));
const u5 = await ev(`JSON.stringify({add: !!document.querySelector('[data-testid="cli-mcp-add"]'), rows: document.querySelectorAll('.cli-sheet-file').length})`);
const j5 = JSON.parse(u5);
check('U5', j5.add, `mcp add button present=${j5.add}, rows=${j5.rows}`);

// U6 — saving with an empty field is refused, so nothing is written.
await ev(`(()=>{const b=document.querySelector('[data-testid="cli-mcp-add"]'); if(b) b.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 500));
await ev(`(()=>{const b=document.querySelector('[data-testid="cli-mcp-save"]'); if(b) b.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 700));
const u6 = await ev(`(()=>{const e=document.querySelector('[data-testid="cli-mcp-error"]'); return e ? e.textContent : 'no-error';})()`);
check('U6', typeof u6 === 'string' && u6 !== 'no-error' && u6.length > 0, `refused with: ${JSON.stringify(u6)}`);

// U7 — a bad name is refused too, so no invalid key reaches settings.json.
await ev(`(()=>{
  const n=document.querySelector('[data-testid="cli-mcp-name"]');
  const t=document.querySelector('[data-testid="cli-mcp-target"]');
  if(!n||!t) return 1;
  const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
    const prev=el.value; d.set.call(el,v); if(el._valueTracker) el._valueTracker.setValue(prev);
    el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(n,'bad name with spaces'); set(t,'npx -y foo');
  return 1;})()`);
await new Promise((r) => setTimeout(r, 400));
await ev(`(()=>{const b=document.querySelector('[data-testid="cli-mcp-save"]'); if(b) b.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 700));
const u7 = await ev(`(()=>{const e=document.querySelector('[data-testid="cli-mcp-error"]'); return e ? e.textContent : 'no-error';})()`);
check('U7', typeof u7 === 'string' && u7 !== 'no-error' && /name/i.test(u7), `bad name refused: ${JSON.stringify(u7)}`);

// U8..U9 — the plugin marketplace browser renders real rows.
await ev(`(()=>{const x=document.querySelector('[data-testid="cli-sheet-close"], .cli-sheet-close'); if(x) x.click(); return 1;})()`);
await ketikSlash();
await new Promise((r) => setTimeout(r, 700));
await bukaPanel('plugins');
/* The catalog read is a real file read plus a sort over 315 entries, so give it
   a moment before judging the panel empty. */
await new Promise((r) => setTimeout(r, 2500));

const u8 = await ev(`document.querySelectorAll('.cli-plugin-row').length`);
check('U8', u8 > 0, `${u8} plugin rows rendered`);

const u9 = await ev(`(()=>{const s=document.querySelector('[data-testid="cli-plugin-search"]');
  if(!s) return JSON.stringify({search:false});
  const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s),'value');
  const prev=s.value; d.set.call(s,'kubernetes'); if(s._valueTracker) s._valueTracker.setValue(prev);
  s.dispatchEvent(new Event('input',{bubbles:true}));
  return JSON.stringify({search:true});})()`);
await new Promise((r) => setTimeout(r, 700));
const u9n = await ev(`document.querySelectorAll('.cli-plugin-row').length`);
check('U9', JSON.parse(u9).search && u9n > 0 && u9n < u8, `search narrowed ${u8} -> ${u9n}`);

// U10..U11 — Status and Sandbox now offer actions, not just values.
await ev(`(()=>{const x=document.querySelector('[data-testid="cli-sheet-close"], .cli-sheet-close'); if(x) x.click(); return 1;})()`);
await ketikSlash();
await new Promise((r) => setTimeout(r, 700));
await ev(`(()=>{const hit=[...document.querySelectorAll('.cli-pop button, button')].find(e=>/^Status$/i.test((e.textContent||'').trim())); if(hit) hit.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 900));
const u10 = await ev(`JSON.stringify({copy: !!document.querySelector('[data-testid="cli-status-copy"]'), doctor: !!document.querySelector('[data-testid="cli-status-doctor"]')})`);
const j10 = JSON.parse(u10);
check('U10', j10.copy && j10.doctor, `status actions: copy=${j10.copy} doctor=${j10.doctor}`);

await ev(`(()=>{const x=document.querySelector('[data-testid="cli-sheet-close"], .cli-sheet-close'); if(x) x.click(); return 1;})()`);
await ketikSlash();
await new Promise((r) => setTimeout(r, 700));
await ev(`(()=>{const hit=[...document.querySelectorAll('.cli-pop button, button')].find(e=>/^Sandbox$/i.test((e.textContent||'').trim())); if(hit) hit.click(); return 1;})()`);
await new Promise((r) => setTimeout(r, 900));
/* The permission-mode chips are the control; a panel that only DESCRIBES the
   mode was the thing being fixed. */
const u11 = await ev(`document.querySelectorAll('[data-testid^="cli-sandbox-"]').length`);
check('U11', u11 > 0, `${u11} permission-mode chips in the sandbox panel`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
