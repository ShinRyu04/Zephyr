// Panggil browser_pane_open di rilis TANPA --renderer-process-limit=1,
// lalu periksa apakah WebView anak BERTAHAN (muncul sebagai target CDP).
const PORT = process.argv[2] ?? '9251';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const t = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && t.has(m.id)) { t.get(m.id)(m); t.delete(m.id); } };
const kirim = (method, params) => { const i = ++id; return new Promise((r) => { t.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); };
const ev = async (expr) => {
  const r = await kirim('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { exc: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};
await kirim('Runtime.enable', {});
const panggil = (cmd, args) => ev(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)},${JSON.stringify(args ?? {})}).then(v=>({ok:true,v})).catch(e=>({ok:false,m:e?.message}))`);

for (let i = 0; i < 60; i++) { const r = await ev(`!!document.querySelector('#root')?.children.length`); if (r) break; await new Promise((r) => setTimeout(r, 500)); }
await new Promise((r) => setTimeout(r, 2000));

const open = await panggil('browser_pane_open', { paneId: 'anak', url: 'http://localhost:8099/', x: 40, y: 120, width: 700, height: 460 });
console.log('open:', open?.ok ? 'OK label=' + open.v?.label : 'GAGAL ' + open?.m);

// Interval pendek: lihat apakah anak sempat hidup sebelum mati.
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 700));
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const anak = targets.filter((x) => x.url.includes('8099') || x.title.includes('UJI'));
  const info = await panggil('browser_pane_info', { paneId: 'anak' });
  const evalr = await panggil('browser_pane_eval', { paneId: 'anak', js: 'document.body.innerText' });
  console.log(`  ${i}: targetAnak=${anak.length} url=${JSON.stringify(info?.ok ? info.v?.url : info?.m)} eval=${evalr?.ok ? JSON.stringify(String(evalr.v).slice(0, 40)) : String(evalr?.m).slice(0, 45)}`);
  if (evalr?.ok && String(evalr.v).includes('UJI BROWSER PANE')) {
    console.log('  == ANAK BERTAHAN DAN MEMUAT HALAMAN ==');
    break;
  }
}
ws.close();
process.exit(0);
