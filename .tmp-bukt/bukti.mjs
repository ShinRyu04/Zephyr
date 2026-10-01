// Bukti: pane browser di exe RILIS, TANPA dev server, halaman benar-benar dimuat.
const PORT = process.argv[2] ?? '9250';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((t) => t.type === 'page');
console.log('instance:', page.title);
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

// Tunggu app benar-benar siap sebelum membuat pane.
for (let i = 0; i < 60; i++) {
  const r = await ev(`!!document.querySelector('#root')?.children.length`);
  if (r) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 3000));

// Pane dibuka ke HOME bawaan aplikasi (bukan URL yang aku tentukan).
// Cara terbaik meniru aplikasi: baca HOME dari bundel tidak mungkin, jadi
// buka pane dengan URL yang SAMA seperti sekarang dipakai aplikasi di rilis.
const HOME = 'https://duckduckgo.com';
console.log('membuka pane ke', HOME, '(HOME rilis)');
const open = await panggil('browser_pane_open', { paneId: 'bukt', url: HOME, x: 40, y: 120, width: 700, height: 460 });
console.log('open:', open?.ok ? 'OK label=' + open.v?.label : 'GAGAL ' + open?.m);

let url = '', judul = '', isi = null;
for (let i = 0; i < 14; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const a = await panggil('browser_pane_info', { paneId: 'bukt' });
  const c = await panggil('browser_pane_eval', { paneId: 'bukt', js: 'document.body.innerText.slice(0,120)' });
  url = a?.ok ? a.v?.url : '(err)';
  judul = a?.ok ? a.v?.title : '';
  if (c?.ok) { isi = c.v; break; }
  if (i % 3 === 0) console.log(`   ${i}: url=${JSON.stringify(url)} title=${JSON.stringify(judul)} eval=${c?.ok ? 'OK' : String(c?.m).slice(0, 50)}`);
}

console.log('');
console.log('url   :', JSON.stringify(url));
console.log('title :', JSON.stringify(judul));
console.log('isi   :', JSON.stringify(String(isi ?? '').slice(0, 140)));
const hidup = typeof isi === 'string' && isi.length > 0 && !/^(ERR|EXC)/.test(String(url));
console.log(hidup ? '== BUKTI: PANE BROWSER MEMUAT HALAMAN DI RILIS ==' : '== GAGAL: halaman masih tidak dimuat ==');
await panggil('browser_pane_close', { paneId: 'bukt' });
ws.close();
process.exit(hidup ? 0 : 1);
