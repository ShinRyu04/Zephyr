// Probe terminal pane background via CDP on the MAIN webview.
const CDP = process.env.CDP;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const t = list.find(x => x.url.includes('tauri.localhost') || x.type === 'page');
  if (!t) throw new Error('target utama tidak ada: ' + JSON.stringify(list.slice(0,3)));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  return { ws, send };
}
async function ev(send, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { ERR: r.result.exceptionDetails.text };
  return r.result?.result?.value;
}

(async () => {
  const { ws, send } = await connect();
  // Tunggu pane terminal ada (app buka shell by default).
  await wait(1500);
  const info = await ev(send, `(()=>{
    const pick = (el)=> el? getComputedStyle(el).backgroundColor : null;
    const xterm = document.querySelector('.xterm');
    const pane = document.querySelector('.xterm-pane');
    const holder = document.querySelector('.xterm-holder');
    const viewport = document.querySelector('.xterm-viewport');
    const rows = document.querySelector('.xterm-rows');
    return {
      adaXterm: !!xterm,
      bgXterm: pick(xterm),
      bgPane: pick(pane),
      bgHolder: pick(holder),
      bgViewport: pick(viewport),
      bgRows: pick(rows),
      themeBg: getComputedStyle(document.documentElement).getPropertyValue('--terminal-bg').trim(),
      editorBg: getComputedStyle(document.documentElement).getPropertyValue('--editor-bg').trim(),
      dataTheme: document.documentElement.dataset.theme,
    };
  })()`);
  console.log(JSON.stringify(info, null, 2));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exitCode = 1; });
