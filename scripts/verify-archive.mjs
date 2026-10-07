/*
 * A1..A4 — large tool output is archived, not shipped into the history.
 *
 * The cost this addresses: a tool result STAYS in the conversation and is billed
 * on every later turn. One 40 KB read_file is ~10,000 tokens re-sent dozens of
 * times for an answer that may use three of its lines. Truncating instead is
 * worse — the model silently loses the rest and reasons from an incomplete list.
 *
 * So the checks measure the SIZE that reaches the model, which is the only
 * number that matters, and confirm the full text is still recoverable.
 *
 * Run: node scripts/verify-archive.mjs
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

/* Build the big strings in Node and embed them, so the newlines survive. */
const kecil = 'baris pendek\n'.repeat(20);
const besar = 'baris keluaran yang cukup panjang untuk melewati batas arsip\n'.repeat(300);

const jalankan = async (teks, nama) => {
  const slot = '__AR' + Math.random().toString(36).slice(2, 7);
  await ev(`window.${slot}=null; import('/src/lib/zephyrTools/builtins.ts?v=${Date.now()}').then(m=>{
    m.arsipkan(${JSON.stringify(teks)}, ${JSON.stringify(nama)})
      .then(v=>window.${slot}={done:true,value:v}, e=>window.${slot}={done:true,error:String(e)});
  }).catch(e=>window.${slot}={done:true,error:'import '+e}); 'go'`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const raw = await ev(`window.${slot}?JSON.stringify(window.${slot}):null`);
    if (!raw) continue;
    const st = JSON.parse(raw);
    if (st.done) return st.error ? { error: st.error } : { value: st.value };
  }
  return { error: 'timeout' };
};

// A1 — a small result passes through untouched: archiving must not tax the
//      common case with a pointless round trip to disk.
const r1 = await jalankan(kecil, 'kecil.txt');
check('A1', r1.value === kecil, `small output unchanged (${kecil.length} chars)`);

// A2 — a large result comes back SMALL. This is the saving.
const r2 = await jalankan(besar, 'besar.txt');
const v2 = r2.value || '';
check('A2', v2.length > 0 && v2.length < besar.length / 4,
  `large output ${besar.length} -> ${v2.length} chars (${Math.round((1 - v2.length / besar.length) * 100)}% less)`);

// A3 — the pointer is present and names a real path, so the rest is reachable.
check('A3', /tool-output/.test(v2) && /read_file/.test(v2),
  `pointer present: ${v2.slice(-120).replace(/\n/g, ' ')}`);

// A4 — the FULL text is on disk, not merely summarised away.
/* The archive now lives under the app's own data folder, so the pointer names
   an absolute path rather than a workspace-relative one. Matched without a
   literal newline in the pattern — one inside the character class would make
   the regex match across lines and swallow the rest of the message. */
const path = (v2.match(/[A-Za-z]:[^\n\]]*tool-output[^\n\]]*\.txt/) || [])[0];
let ada = 'no-path';
if (path) {
  /*
   * A slot on `window`, because `Runtime.evaluate` does not await a returned
   * promise and `awaitPromise` is unreliable in WebView2 — an async IIFE comes
   * back as an empty object, which is what "[object Object]" was.
   */
  const slot = '__FS' + Math.random().toString(36).slice(2, 7);
  /* Read through the archive's own command: the file lives OUTSIDE the
     workspace, so `fs_read` correctly refuses it — which is exactly the bug
     this check now guards, because the model was handed a pointer to a file it
     was then denied. */
  await ev(`window.${slot}=null;(async()=>{try{ const r=await window.__TAURI_INTERNALS__.invoke('ai_read_tool_output',{path:${JSON.stringify(path)}});
    window.${slot}={done:true,value: (typeof r==='string') ? r.length : -1};
  }catch(e){ window.${slot}={done:true,value:'ERR '+((e&&e.message)||String(e))}; }})(); 'go'`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const raw = await ev(`window.${slot}?JSON.stringify(window.${slot}):null`);
    if (!raw) continue;
    const st = JSON.parse(raw);
    if (st.done) { ada = st.value; break; }
  }
}
check('A4', typeof ada === 'number' ? ada >= besar.length : false,
  `full text recoverable on disk: ${typeof ada === 'number' ? ada + ' chars' : ada}`);

ws.close();
const pass = out.filter(Boolean).length;
console.log(`\n== ${pass}/${out.length} lulus ==`);
process.exit(pass === out.length ? 0 : 1);
