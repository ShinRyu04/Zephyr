/*
 * Apakah MCP benar-benar memeriksa tokennya?
 *
 * AGENTS.md menyatakan MCP memakai auth Bearer. Kalau benar, setiap permintaan
 * tanpa token harus ditolak dengan 401 - bukan hanya sebagian.
 *
 * /health diuji terpisah dengan sengaja: ada alasan sah untuk membiarkannya
 * terbuka (monitoring, cek port), tapi itu keputusan yang harus DISADARI. Kalau
 * ternyata terbuka tanpa niat, itu temuan, bukan detail.
 */
const PORT = 9224;
const TOKEN = process.env.ZEPHYR_MCP_TOKEN;
const TOKEN_SALAH = 'token-yang-pasti-salah-0000';

const coba = async (nama, { method = 'POST', body, auth }) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  let hasil;
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/${method === 'GET' ? 'health' : ''}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    const teks = await r.text();
    hasil = { status: r.status, isi: teks.slice(0, 120) };
  } catch (e) {
    hasil = { status: 0, isi: e.message };
  }
  const aman =
    nama.includes('salah') || nama.includes('tanpa token') ? hasil.status === 401 : hasil.status === 200;
  console.log(`  ${aman ? 'BENAR ' : 'BOCOR '} ${nama.padEnd(30)} -> ${hasil.status}  ${hasil.isi}`);
  return aman;
};

let lulus = 0;
let total = 0;
const hitung = (ok) => {
  total++;
  if (ok) lulus++;
};

const list = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

console.log('=== POST / (JSON-RPC) ===');
hitung(await coba('tools/list tanpa token', { body: list }));
hitung(await coba('tools/list token SALAH', { body: list, auth: TOKEN_SALAH }));
hitung(await coba('tools/list token BENAR', { body: list, auth: TOKEN }));

const panggil = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_editors', arguments: {} } };
hitung(await coba('tools/call tanpa token', { body: panggil }));

console.log('\n=== GET /health ===');
hitung(await coba('health tanpa token', { method: 'GET' }));

console.log(`\n== ${lulus}/${total} benar ==`);
process.exit(lulus === total ? 0 : 1);
