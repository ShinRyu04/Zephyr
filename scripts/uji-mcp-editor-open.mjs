/*
 * Apakah editor_open MCP bisa menjawab sama sekali?
 *
 * Gejalanya: "the UI did not answer for 'editor_open' after 3 attempts".
 * Itu bisa berarti dua hal yang sangat berbeda:
 *
 *   A. Protokolnya tidak pernah menyelesaikan permintaan ini (bug di jalur
 *      mcp-action -> UI -> balasan), jadi editor_open tidak akan pernah bisa
 *      dipakai oleh klien luar.
 *   B. Hanya berkas tertentu yang gagal (mis. path di luar workspace).
 *
 * Yang membedakan: berkas yang SUDAH ada dan berada di dalam workspace yang
 * sedang terbuka. Kalau itu juga tidak dijawab, penyebabnya A.
 *
 * Daftar editor dibaca dulu, karena list_editors bergantung pada UI yang sama -
 * dan itu menunjukkan apakah jembatan ke UI hidup, terlepas dari editor_open.
 */
const PORT = 9224;
const TOKEN = process.env.ZEPHYR_MCP_TOKEN;

let id = 0;
const rpc = async (method, params) => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    if (j.error) return { GAGAL: j.error.message };
    return j.result;
  } catch (e) {
    return { GAGAL: e.message };
  }
};
const panggil = (name, args) => rpc('tools/call', { name, arguments: args });
const teks = (h) => (h?.GAGAL ? 'GAGAL ' + h.GAGAL : (h?.content?.[0]?.text ?? JSON.stringify(h).slice(0, 300)));

console.log('=== list_editors (jembatan UI yang sama) ===');
console.log(teks(await panggil('list_editors', {})));

console.log('\n=== editor_open berkas yang SUDAH ADA di workspace Talos ===');
console.log(teks(await panggil('editor_open', { path: 'D:/Talos/situs/index.html' })));

console.log('\n=== editor_open berkas yang BELUM ada ===');
console.log(teks(await panggil('editor_open', { path: 'D:/Talos/situs/script.js' })));

console.log('\n=== run_command (jalur UI lain, sebagai pembanding) ===');
console.log(teks(await panggil('run_command', { id: 'view.explorer' })));
