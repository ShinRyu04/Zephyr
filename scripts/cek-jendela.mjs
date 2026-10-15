/* Pastikan jendela yang hidup benar-benar Zephyr pada kode terbaru, bukan
 * halaman lain yang kebetulan memakai port CDP yang sama. */
const PORT = process.argv[2] || '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
if (!page) {
  console.log('tidak ada halaman');
  process.exit(1);
}
console.log('judul:', page.title, '| url:', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const js = String.raw`(async () => {
  const t = await (await fetch('/src/lib/zephyrTools/builtins.ts')).text();
  const rb = await (await fetch('/src/lib/aiStore.ts')).text();
  return JSON.stringify({
    zephyr: document.title.includes('Zephyr'),
    adaFallback: rb.includes('pilihModelCadangan'),
    adaCapPayload: rb.includes('PAYLOAD_MAX_CHARS'),
    toolTerpasang: window.__ZEPHYR_TOOLS__ ? window.__ZEPHYR_TOOLS__.nama().length : null,
  });
})()`;
const m = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
console.log(m.result?.result?.value ?? JSON.stringify(m.result).slice(0, 300));
ws.close();