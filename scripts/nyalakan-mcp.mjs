/*
 * Menyalakan server MCP Zephyr dari luar, lalu MEMBUKTIKAN ia hidup.
 *
 * Setelannya sedang `enabled: false`, dan port yang diminta 9224 (9222 dipegang
 * msedgewebview2, debug port WebView2). Jadi "MCP selalu di 9222" tidak berlaku
 * di mesin ini - yang harus diperiksa adalah port yang BENAR-BENAR dipakai, dan
 * itu dibaca dari runtime, bukan dari setelan.
 *
 * Membuktikan hidup bukan dengan membaca status saja: status bisa bilang
 * running sementara socket-nya belum menerima apa pun. Jadi HTTP /health
 * ditembak setelahnya.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
if (!page) {
  console.log('Zephyr tidak ketemu di debug port 9223');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const send = (m, pa) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: pa }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true });
  if (r.result?.exceptionDetails) return 'GALAT: ' + String(r.result.exceptionDetails.exception?.description || '').split('\n')[0];
  return r.result?.result?.value;
};

const sebelum = await ev('JSON.stringify(window.__ZEPHYR_MCP__.store.getState().status)');
console.log('sebelum   :', sebelum);

/*
 * Argumennya WAJIB: `toggleServer(on)`.
 *
 * Dipanggil tanpa argumen, `on` bernilai undefined dan jalur `else` yang jalan -
 * yaitu mcpStop. Jadi "menyalakan tanpa argumen" justru mematikan server, dan
 * tidak ada satu pun gejala yang membedakannya dari "gagal menyalakan": status
 * tetap running:false dan tidak ada log percobaan start. Ini pernah terjadi di
 * sesi ini; `true` yang benar.
 */
const hasil = await ev('window.__ZEPHYR_MCP__.store.getState().toggleServer(true)');
console.log('toggle    :', hasil);

await new Promise((r) => setTimeout(r, 3000));

const sesudah = await ev('JSON.stringify(window.__ZEPHYR_MCP__.store.getState().status)');
console.log('sesudah   :', sesudah);

ws.close();

/* --- bukti socket-nya benar-benar menerima --- */
const st = JSON.parse(sesudah);
const port = st.port;
let hidup = false;
try {
  const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
  const body = await r.text();
  console.log(`\n  GET http://127.0.0.1:${port}/health  ->  ${r.status}  ${body}`);
  /* 200 saja belum cukup: port mati pun bisa menjawab dari proses lain.
     Yang menentukan adalah bentuk balasannya - {"ok":true,...}. */
  hidup = r.status === 200 && /"ok"\s*:\s*true/.test(body);
} catch (e) {
  console.log(`\n  GET http://127.0.0.1:${port}/health  ->  GAGAL: ${e.message}`);
}

console.log(hidup ? `\n  MCP HIDUP di port ${port}` : '\n  MCP masih tidak menjawab');
process.exit(hidup ? 0 : 1);
