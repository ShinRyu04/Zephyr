// Baca pane yang dibuat APLIKASI sendiri (label browser-pane-*), bukan pane uji.
// Ini yang sebenarnya kamu lihat di layar.
const PORT = process.argv[2] ?? '9250';
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

// Label pane yang dibuat aplikasi: browser-pane-<tabid>-<n>
const label = process.argv[3];
console.log('memeriksa label:', label);

for (let i = 0; i < 6; i++) {
  const info = await panggil('browser_pane_info', { paneId: label.replace(/^browser-/, '') });
  console.log(`  info: ${info?.ok ? JSON.stringify(info.v) : info?.m}`);
  const isi = await panggil('browser_pane_eval', { paneId: label.replace(/^browser-/, ''), js: 'document.body.innerText.slice(0,150)' });
  console.log(`  eval: ${isi?.ok ? JSON.stringify(String(isi.v).slice(0, 150)) : isi?.m}`);
  await new Promise((r) => setTimeout(r, 1500));
  if (info?.ok) break;
}

// Lihat juga dari daftar target CDP: apakah ada target page tambahan (webview anak)?
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
console.log('');
console.log('== semua target CDP ==');
for (const x of targets) console.log(`   ${x.type} | ${x.title} | ${x.url}`);
ws.close();
process.exit(0);
