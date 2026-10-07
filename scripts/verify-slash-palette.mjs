/*
 * S1..S5 — typing "/" shows commands; the chip does not.
 *
 * Three separate defects were reported from the running app:
 *   1. the palette did not list the CLI's slash commands at all,
 *   2. clicking the "/" chip opened the same list (unexpected from a button),
 *   3. the palette opened upward and ran off the top of the panel, so it was
 *      partly invisible.
 *
 * Checked against the live panel rather than asserted from the source, because
 * all three are about what appears when a real key is pressed.
 *
 * Run: node scripts/verify-slash-palette.mjs
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

console.log('tab:', await ev(`(()=>{const t=[...document.querySelectorAll('[role="tab"],button')].find(e=>/^Claude Code$/.test((e.textContent||'').trim())); if(t) t.click(); return 'ok';})()`));
await new Promise((r) => setTimeout(r, 900));

/* Type "/" the way React sees it: the native setter plus an input event, with
   the value tracker reset — setting .value alone does not fire onChange. */
const ketik = async (teks) => {
  await ev(`(()=>{
    const box=document.querySelector('.cli-native-input');
    if(!box) return 'no-input';
    const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box),'value');
    const prev=box.value;
    d.set.call(box, ${JSON.stringify(teks)});
    if(box._valueTracker) box._valueTracker.setValue(prev);
    box.dispatchEvent(new Event('input',{bubbles:true}));
    return 'typed';})()`);
  await new Promise((r) => setTimeout(r, 700));
};

await ketik('/');
const palet = await ev(`(()=>{const p=document.querySelector('[data-testid^="ai-clichat-slash-menu-"]'); if(!p) return JSON.stringify({open:false});
  const cmd=p.querySelectorAll('[data-testid^="ai-clichat-cmd-"]').length;
  const act=p.querySelectorAll('[data-testid^="ai-clichat-slash-"]').length;
  const groups=[...p.querySelectorAll('.cli-pop-group')].map(e=>e.textContent);
  return JSON.stringify({open:true, commands:cmd, actions:act, groups});})()`);
const p1 = JSON.parse(palet);
check('S1', p1.open, `palette opens on typing "/": ${palet}`);
check('S2', p1.commands > 0, `${p1.commands} CLI commands listed (groups: ${p1.groups})`);
check('S3', p1.actions > 0, `${p1.actions} app actions still listed`);

/* The list must FIT: its top edge has to stay inside the panel, which is what
   broke when the palette grew past its fixed 240px height. */
const muat = await ev(`(()=>{const p=document.querySelector('[data-testid^="ai-clichat-slash-menu-"]'); if(!p) return 'no-palette';
  const r=p.getBoundingClientRect();
  return JSON.stringify({top:Math.round(r.top), h:Math.round(r.height), terlihat: r.top >= 0});})()`);
const m1 = JSON.parse(muat);
check('S4', m1.terlihat === true, `palette top stays on screen: ${muat}`);

/* Clearing the box closes it, so the next typed character is not swallowed. */
await ketik('');
const tutup = await ev(`document.querySelectorAll('[data-testid^="ai-clichat-slash-menu-"]').length`);
check('S5', tutup === 0, `palette closes when the slash is deleted: ${tutup}`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
