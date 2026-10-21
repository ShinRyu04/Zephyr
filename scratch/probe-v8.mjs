// Probe: apakah kartu provider ter-render di jendela utama setelah
// setActivity('settings') + setSettingsOpen(true) + setSection('models').
import WebSocket from 'ws';

const PORT = process.argv[2] ?? '9223';

class Cdp {
  #ws; #id = 0; #pending = new Map();
  static async connect(url) {
    const c = new Cdp();
    c.#ws = new WebSocket(url);
    await new Promise((res, rej) => { c.#ws.once('open', res); c.#ws.once('error', rej); });
    c.#ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      const p = c.#pending.get(m.id);
      if (p) { c.#pending.delete(m.id); p(m); }
    });
    return c;
  }
  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((res) => { this.#pending.set(id, res); this.#ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error');
    return r.result?.result?.value;
  }
  close() { try { this.#ws.close(); } catch { /* ignore */ } }
}

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
for (const t of targets) console.log('target:', t.title, '|', t.url);

const page = targets.find((t) => /index\.html#?$/.test(t.url) || t.url.endsWith('index.html') || t.url.endsWith('/'))
  ?? targets[targets.length - 1];
console.log('\npakai:', page.url, '\n');

const cdp = await Cdp.connect(page.webSocketDebuggerUrl);

const slot = `__PROBE_${Date.now()}`;
await cdp.eval(`(() => {
  window[${JSON.stringify(slot)}] = { done: false, value: null, error: null };
  (async () => {
    const S = window.__ZEPHYR__;
    const SET = window.__ZEPHYR_SET__;
    S.getState().setActivity('settings');
    S.getState().setSettingsOpen(true);
    await new Promise(r => setTimeout(r, 400));
    SET.ui.getState().setSection('models');
    await new Promise(r => setTimeout(r, 2500));
    window[${JSON.stringify(slot)}].value = JSON.stringify({
      url: location.href,
      section: SET.ui.getState().section,
      setOpen: S.getState().settingsOpen,
      activity: S.getState().activity,
      adaNavModels: !!document.querySelector('[data-testid="set-nav-models"]'),
      adaProvKey: !!document.querySelector('[data-testid="prov-key-gemini"]'),
      jmlProv: document.querySelectorAll('[data-testid^="prov-key-"]').length,
      topbar: !!document.querySelector('.set-topbar'),
      potongan: (document.body.innerText || '').slice(0, 300).replace(/\\s+/g, ' '),
    });
    window[${JSON.stringify(slot)}].done = true;
  })().catch((e) => { window[${JSON.stringify(slot)}].error = String(e); window[${JSON.stringify(slot)}].done = true; });
  return 'start';
})()`);

let hasil = null;
for (let i = 0; i < 60; i++) {
  const st = await cdp.eval(`JSON.stringify(window[${JSON.stringify(slot)}])`);
  const o = JSON.parse(st);
  if (o.done) { hasil = o.error ? `ERROR: ${o.error}` : o.value; break; }
  await new Promise((r) => setTimeout(r, 200));
}

console.log(hasil);
cdp.close();
