// probe-ai.mjs — cek satu putaran chat lewat jalur asli (Rust ai_chat) ke
// mock provider. Dipakai saat mendiagnosis streaming fase 09.
//
// node scripts/probe-ai.mjs 9223 gemini|openai|anthropic

import WebSocket from 'ws';

const port = process.argv[2] ?? '9223';
const provider = process.argv[3] ?? 'gemini';
const MOCK = 8098;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
});
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  const p = pending.get(m.id);
  if (p) {
    pending.delete(m.id);
    p(m);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evalExpr = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
  return r.result?.result?.value;
};

const model =
  provider === 'anthropic'
    ? 'claude-sonnet-4.5'
    : provider === 'openai'
      ? 'gpt-5.2'
      : 'gemini-3.6-flash';
const base =
  provider === 'openai' ? `http://127.0.0.1:${MOCK}/v1` : `http://127.0.0.1:${MOCK}`;

await evalExpr(`(() => {
  window.__PROBE = { chunks: [] };
  return 'ok';
})()`);

// Pasang listener kedua khusus probe supaya kelihatan apa yang datang dari Rust.
await evalExpr(`(async () => {
  const { listen } = await import('/@id/@tauri-apps/api/event');
  window.__PROBE.un = await listen('ai-chunk', (e) => window.__PROBE.chunks.push(e.payload));
  return 'listening';
})()`);
await sleep(600);

await evalExpr(`(async () => {
  const A = window.__ZEPHYR_AI__;
  const S = window.__ZEPHYR__.getState();
  const X = window.__ZEPHYR_SET__;
  await X.setKey(${JSON.stringify(provider)}, 'PROBE-KEY-123');
  await S.applySettings({ models: { activeProvider: ${JSON.stringify(provider)},
    providers: { ${provider}: { baseUrl: ${JSON.stringify(base)}, model: ${JSON.stringify(model)} } } } });
  await A.store.getState().loadKeys();
  await A.store.getState().setModel(${JSON.stringify(model)});
  A.store.getState().newChat();
  await A.send('sapa saya');
  return 'sent';
})()`);

for (let i = 0; i < 25; i++) {
  await sleep(400);
  const st = JSON.parse(
    await evalExpr(`JSON.stringify({
      pending: window.__ZEPHYR_AI__.store.getState().pending,
      chunks: window.__PROBE.chunks.slice(0, 6),
      total: window.__PROBE.chunks.length,
      msgs: window.__ZEPHYR_AI__.messages().map(m => ({ role: m.role, len: m.content.length, err: m.error, streaming: m.streaming })),
    })`),
  );
  if (!st.pending) {
    console.log(JSON.stringify(st, null, 1));
    break;
  }
  if (i === 24) console.log('TIMEOUT', JSON.stringify(st, null, 1));
}

await evalExpr(`(() => { window.__PROBE.un?.(); return 'off'; })()`);
ws.close();
