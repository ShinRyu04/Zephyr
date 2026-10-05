/*
 * Apakah editor_open bisa bekerja di workspace yang SEDANG AKTIF?
 *
 * /health menjawab editors:0 panes:0 untuk workspace Talos, sementara
 * list_editors menjawab t1..t3. Dua jawaban itu tidak mungkin benar bersamaan
 * untuk workspace yang sama - jadi salah satunya membaca workspace lain.
 *
 * Yang diuji: apakah jumlah editor yang dilaporkan /health berubah setelah
 * sebuah berkas dibuka lewat UI. Kalau tidak berubah, /health tidak membaca
 * workspace aktif, dan "UI did not answer" bukan kesalahan editor_open.
 */
const PORT = 9224;
const TOKEN = process.env.ZEPHYR_MCP_TOKEN;

let id = 0;
const rpc = async (method, params) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  return r.json();
};
const health = async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(4000) });
  return r.json();
};
const teks = (j) => j.error?.message ?? j.result?.content?.[0]?.text ?? JSON.stringify(j.result).slice(0, 200);

console.log('health sebelum        :', JSON.stringify(await health()));
console.log('list_editors          :', teks(await rpc('tools/call', { name: 'list_editors', arguments: {} })));
console.log('workspace aktif       :', teks(await rpc('tools/call', { name: 'workspace_info', arguments: {} })));

console.log('\n-- editor_open pada berkas yang ADA --');
console.log(teks(await rpc('tools/call', { name: 'editor_open', arguments: { path: 'D:/Talos/situs/styles.css' } })));

console.log('\nhealth sesudah        :', JSON.stringify(await health()));
console.log('list_editors sesudah  :', teks(await rpc('tools/call', { name: 'list_editors', arguments: {} })));
