// buka terminal via DOM release, inspeksi xterm — HAPUS setelah selesai.
import WebSocket from 'ws';
const port = process.argv[2] || '9224';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result?.result?.value; };

// 1. fokus tab terminal di panel bawah
console.log('open:', await ev(`(async () => {
  // klik tombol terminal di ActivityBar / atau panel tab
  const picker = document.querySelector('[data-testid="term-picker"]');
  const empty = document.querySelector('[data-testid="empty-shell"]');
  return JSON.stringify({ hasPicker: !!picker, hasEmptyShell: !!empty, paneEmpty: !!document.querySelector('[data-testid="pane-empty"]') });
})()`));
await new Promise(r=>setTimeout(r,500));

// 2. klik empty-shell untuk buat pane
console.log('click empty-shell:', await ev(`(async () => {
  const b = document.querySelector('[data-testid="empty-shell"]');
  if (!b) return 'no button';
  b.click();
  await new Promise(r=>setTimeout(r,3500));
  const xterm = document.querySelector('.xterm');
  const screen = document.querySelector('.xterm-screen');
  const rows = document.querySelector('.xterm-rows');
  return JSON.stringify({
    xterm: !!xterm,
    xtermBg: xterm ? getComputedStyle(xterm).backgroundColor : null,
    screenBg: screen ? getComputedStyle(screen).backgroundColor : null,
    rowsLen: rows ? rows.textContent.length : 0,
    rowsText: rows ? rows.textContent.slice(0,60) : null,
    termBgTok: getComputedStyle(document.documentElement).getPropertyValue('--terminal-bg'),
    paneCount: document.querySelectorAll('.xterm').length,
  });
})()`));
ws.close();
