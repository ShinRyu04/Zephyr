// Probe: kenapa chat di window Agents (pop-out) tidak dibalas AI?
// Koneksi langsung ke target CDP yang URL-nya #agents.
import WebSocket from 'ws';

const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const t = targets.find((x) => x.url.includes('#agents'));
if (!t) { console.log('TARGET #agents TIDAK ADA'); process.exit(1); }
console.log('target:', t.url);

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
    const tmo = setTimeout(() => { pending.delete(myId); reject(new Error(`timeout ${method}`)); }, 15000);
    pending.set(myId, { resolve, t: tmo });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
async function evaljs(expr, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails) };
  return r.result?.result?.value;
}

// 1. Bridge dev ada?
console.log('bridge AI:', await evaljs('typeof window.__ZEPHYR_AI__'));

// 2. Keadaan store AI di window ini
const st = await evaljs(`(() => {
  const s = window.__ZEPHYR_AI__?.store?.getState?.();
  if (!s) return null;
  const sess = s.activeSession?.();
  return {
    provider: s.provider, model: s.model,
    agentMode: s.agentMode, pending: s.pending, agentBusy: s.agentBusy,
    hasKey: typeof s.hasKey === 'function' ? s.hasKey() : 'n/a',
    keysLoaded: Array.isArray(s.keys) ? s.keys.filter(k=>k.hasKey).map(k=>k.provider) : null,
    activeId: s.activeId, sessionCount: s.sessions?.length ?? 0,
    msgs: (sess?.messages ?? []).slice(-6).map(m => ({
      role: m.role, streaming: !!m.streaming, error: m.error ?? null,
      content: (m.content ?? '').slice(0, 120),
    })),
    toast: s.toast ?? null,
    settingsLoaded: window.__ZEPHYR__?.getState?.().settingsLoaded ?? null,
    listener: !!window.__ZEPHYR_AI_LISTENER_PROMISE__,
    callback: !!window.__ZEPHYR_AI_CALLBACK__,
  };
})()`);
console.log('state:', JSON.stringify(st, null, 1));

ws.close();
