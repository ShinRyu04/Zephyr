/*
 * BUKTI bug token MCP: token yang ditampilkan UI/ditulis mcp.json bisa BEDA
 * dengan token yang dituntut server yang sedang jalan → semua klien 401,
 * seolah kliennya yang salah.
 *
 * Alur: (1) baca token berlaku + status HTTP-nya, (2) rusakkan token di
 * mcp.json (simulasi berkas basi/terpotong/ter-mask), (3) panggil refresh UI
 * (yang memanggil mcp_status → load_or_init), (4) token BARU dicatat.
 */
import fs from 'node:fs';
import { Cdp } from '../scripts/lib-cdp.mjs';

const BERKAS = 'C:/Users/Zyrex/AppData/Roaming/zephyr/mcp.json';
const baca = () => JSON.parse(fs.readFileSync(BERKAS, 'utf8')).token;

async function cek(token) {
  const res = await fetch('http://127.0.0.1:9224/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_window', params: {} }),
  });
  const body = await res.text();
  return `${res.status} ${body.slice(0, 80)}`;
}

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const ms = async (kode) =>
  JSON.parse(await cdp.runAsync(`const st = M.store.getState(); await ${kode}; await wait(300); return JSON.stringify({ token: M.store.getState().status?.token ?? null, port: M.store.getState().status?.port ?? null });`));

await ms('M.refresh()');
const T0 = baca();
console.log(`1) token berkas/UI  : ${T0.slice(0, 8)}…  → HTTP ${await cek(T0)}`);

// (2) rusakkan berkas: tulis token yang tidak sah (persis seperti berkas basi).
fs.writeFileSync(BERKAS, JSON.stringify({ token: '***', port: 9224 }, null, 2));
console.log(`2) berkas dirusak   : token "***"`);

// (3) UI memanggil mcp_status (seperti saat membuka Settings / polling status).
const sesudah = await ms('M.refresh()');
const T1 = baca();
console.log(`3) sesudah refresh  : token berkas ${T1.slice(0, 8)}…  (UI: ${String(sesudah.token).slice(0, 8)}…)`);
console.log(`   berkas==UI?      : ${T1 === sesudah.token}`);
console.log(`4) HTTP pakai token baru (yang ditampilkan UI & ditulis berkas):`);
console.log(`   → ${await cek(T1)}`);
console.log(`   HTTP pakai token lama: ${await cek(T0)}`);

try {
  cdp.close();
} catch {
  /* tidak apa-apa */
}
