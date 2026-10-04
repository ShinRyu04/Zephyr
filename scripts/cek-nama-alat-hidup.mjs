/*
 * Bukti dari APLIKASI HIDUP: nama tool apa yang benar-benar ditawarkan ke model.
 *
 * Uji sumber (verify-katalog-mcp.mjs) membaca berkas. Itu membuktikan apa yang
 * tertulis, bukan apa yang dipakai. Yangdolhongsoal user adalah nama yang
 * muncul di layar dan keluar dari mulut model, jadi yang diperiksa di sini
 * adalah hasil yang benar-benar dikirim.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const expr = `(async () => {
  try {
    const c = await import('/src/lib/zephyrTools/catalog.ts');
    const mcp = (c.TOOL_CATALOG ?? []).filter((t) => (t.source ?? '') === 'mcp');
    return JSON.stringify({
      awalan: c.AWALAN_MCP,
      pola: String(c.POLA_AWALAN_MCP),
      namaMcp: mcp.map((t) => t.name),
      jumlahSemua: (c.TOOL_CATALOG ?? []).length,
    });
  } catch (e) { return JSON.stringify({ galat: JSON.stringify(e).slice(0, 300) }); }
})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
ws.close();
const v = JSON.parse(r.result?.result?.value ?? '{}');
if (v.galat) {
  console.log('GAGAL:', v.galat);
  process.exit(1);
}
console.log('awalan di app hidup:', v.awalan);
console.log('jumlah tool:', v.jumlahSemua);
console.log('nama MCP:', (v.namaMcp ?? []).join(', '));

let lulus = 0;
const cek = (nama, ok) => {
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  ${nama}`);
  if (ok) lulus++;
};
const ada = (v.namaMcp ?? []).filter((n) => n.startsWith('mcp__tedi__'));
const baru = (v.namaMcp ?? []).filter((n) => n.startsWith('mcp__zephyr__'));

cek('semua tool MCP memakai awalan mcp__zephyr__', baru.length === (v.namaMcp ?? []).length && baru.length > 0);
cek('tidak ada satu pun nama retired yang ditawarkan', ada.length === 0);
console.log(`\n== ${lulus}/2 lulus ==`);
process.exit(lulus === 2 ? 0 : 1);