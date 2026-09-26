// inspeksi terminal di build RELEASE — HAPUS setelah selesai.
import WebSocket from 'ws';
const port = process.argv[2] || '9224';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, userGesture: true, awaitPromise: true }); if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result?.result?.value; };

console.log('bridges:', await ev(`JSON.stringify({zephyr: typeof window.__ZEPHYR__, term: typeof window.__ZEPHYR_TERM__, pty: typeof window.__ZEPHYR_PTY__, errs: Array.isArray(window.__ZEPHYR_ERRORS__)})`));

console.log('term:', await ev(`(async () => {
  if (typeof window.__ZEPHYR_TERM__ === 'undefined') return 'no term bridge';
  const T = window.__ZEPHYR_TERM__.getState();
  T.setVisible(true);
  for (const t of T.terminalTabs.slice()) await T.closeTab(t.id);
  await new Promise(r=>setTimeout(r,400));
  const pid = await window.__ZEPHYR_TERM__.getState().addPane('shell');
  await new Promise(r=>setTimeout(r,3000));
  const xterm = document.querySelector('.xterm');
  const screen = document.querySelector('.xterm-screen');
  const rows = document.querySelector('.xterm-rows');
  const css = getComputedStyle(document.documentElement);
  return JSON.stringify({
    pid,
    xtermBg: xterm ? getComputedStyle(xterm).backgroundColor : null,
    screenBg: screen ? getComputedStyle(screen).backgroundColor : null,
    rowsText: rows ? rows.textContent.slice(0, 60) : null,
    termBgToken: css.getPropertyValue('--terminal-bg'),
    editorBgToken: css.getPropertyValue('--editor-bg'),
    panelVisible: window.__ZEPHYR_TERM__.getState().visible,
  });
})()`));
ws.close();
