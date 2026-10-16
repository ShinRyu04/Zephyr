// Kirim chat dari window Agents, rekam chunk ai-chunk yang masuk + evolusi state.
import WebSocket from 'ws';

const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const t = targets.find((x) => x.url.includes('#agents'));
if (!t) { console.log('TARGET #agents TIDAK ADA'); process.exit(1); }

const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  const p = pending.get(m.id);
  if (p) { pending.delete(m.id); clearTimeout(p.t); p.resolve(m); }
});
function send(method, params = {}) {
  const myId = ++id;
  return new Promise((resolve, reject) => {
    const tmo = setTimeout(() => { pending.delete(myId); reject(new Error(`timeout ${method}`)); }, 20000);
    pending.set(myId, { resolve, t: tmo });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
async function evaljs(expr, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails) };
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pasang pengintai chunk: bungkus callback + listen langsung dari konteks halaman
// (cek apakah event ai-chunk SAMPAI ke window ini sama sekali).
const hook = await evaljs(`(() => {
  window.__PROBE__ = { chunks: 0, first: null, last: null, listenerHit: 0 };
  const cb = window.__ZEPHYR_AI_CALLBACK__;
  window.__ZEPHYR_AI_CALLBACK__ = (c) => {
    window.__PROBE__.chunks++;
    if (!window.__PROBE__.first) window.__PROBE__.first = JSON.stringify(c).slice(0, 200);
    window.__PROBE__.last = JSON.stringify(c).slice(0, 300);
    try { return cb(c); } catch (e) { window.__PROBE__.cbErr = String(e); }
  };
  // listener mentah: bukti event benar-benar sampai ke webview ini
  window.__PROBE__.raw = new Promise((resolve) => {
    const un = window.__TAURI__?.event?.listen?.('ai-chunk', (e) => {
      window.__PROBE__.listenerHit++;
      if (window.__PROBE__.listenerHit === 1) window.__PROBE__.rawFirst = JSON.stringify(e.payload).slice(0, 200);
    });
    resolve(typeof un);
  });
  return { wrapped: true, tauriEvent: typeof window.__TAURI__?.event?.listen };
})()`);
console.log('hook:', JSON.stringify(hook));
await evaljs('window.__PROBE__.raw', true);

// Kirim pesan pendek lewat jalur yang sama dengan composer.
const kirim = await evaljs(`window.__ZEPHYR_AI__.send('Balas satu kata saja: OK').then(v => ({ok:v})).catch(e => ({err:String(e)}))`, true);
console.log('send:', JSON.stringify(kirim));

// Amati 20 detik.
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const s = await evaljs(`(() => {
    const st = window.__ZEPHYR_AI__.store.getState();
    const sess = st.activeSession?.();
    return {
      n: window.__PROBE__.chunks,
      raw: window.__PROBE__.listenerHit,
      pending: st.pending, busy: st.agentBusy, toast: st.toast,
      msgs: (sess?.messages ?? []).map(m => ({
        r: m.role, s: !!m.streaming, e: m.error ?? null,
        c: (m.content ?? '').slice(0, 80),
      })),
      first: window.__PROBE__.first, last: window.__PROBE__.last, cbErr: window.__PROBE__.cbErr ?? null,
      rawFirst: window.__PROBE__.rawFirst ?? null,
    };
  })()`);
  const beres = s.msgs?.some((m) => m.r === 'assistant' && (m.e || (!m.s && m.c)));
  console.log(`t+${((i + 1) * 0.5).toFixed(1)}s chunks=${s.n} raw=${s.raw} pending=${s.pending} busy=${s.busy} toast=${s.toast} msgs=${JSON.stringify(s.msgs)}`);
  if (beres && !s.pending) break;
}
const akhir = await evaljs(`JSON.stringify({first:window.__PROBE__.first, last:window.__PROBE__.last, cbErr:window.__PROBE__.cbErr??null, rawFirst:window.__PROBE__.rawFirst??null})`);
console.log('detail:', akhir);
ws.close();
