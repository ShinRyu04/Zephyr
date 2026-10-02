const CDP = process.env.CDP;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const t = list.find(x => x.type === 'page');
  if (!t) throw new Error('no page ' + JSON.stringify(list.slice(0, 3)));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  return { ws, send };
}
async function ev(send, e) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { ERR: r.result.exceptionDetails.text };
  return r.result?.result?.value;
}
(async () => {
  const { ws, send } = await connect();
  await wait(2000);
  const info = await ev(send, `(()=>{
    const r = {};
    r.dataTheme = document.documentElement.dataset.theme;
    r.htmlClass = document.documentElement.className;
    r.bodyText = (document.body.innerText||'').slice(0,200);
    r.panelCount = document.querySelectorAll('[class*=panel]').length;
    r.attrs = [...document.querySelectorAll('[data-pane-body],[data-pane-kind],[class*=xterm]')].slice(0,8).map(e=>e.tagName+'.'+(e.className||'').toString().slice(0,40));
    r.termVars = ['--terminal-bg','--editor-bg','--bg','--text'].map(n=>n+'='+getComputedStyle(document.documentElement).getPropertyValue(n).trim());
    return r;
  })()`);
  console.log(JSON.stringify(info, null, 2));
  ws.close();
})().catch(e => { console.log('ERR', e.message); process.exitCode = 1; });
