/*
 * UJI ULANG bukti token drift SESUDAH perbaikan (mcp_config::sebarkan_token).
 *
 * Skenario yang sama seperti v11-bukti-token-drift.mjs: berkas mcp.json dibuat
 * basi (token tak sah) lalu UI memanggil mcp_status. Sebelum perbaikan, token
 * yang ditulis berkas/ditampilkan UI DITOLAK server (401) selamanya. Sesudah
 * perbaikan, server harus mengikuti berkas -> 200.
 */
import fs from 'node:fs';
import { Cdp } from '../scripts/lib-cdp.mjs';

const BERKAS = 'C:/Users/Zyrex/AppData/Roaming/zephyr/mcp.json';
const isi = () => JSON.parse(fs.readFileSync(BERKAS, 'utf8'));

async function cek(port, token) {
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_window', params: {} }),
  });
  const body = await res.text();
  return { status: res.status, cuplik: body.slice(0, 60) };
}

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const jalan = JSON.parse(
  await cdp.runAsync(`
    const MS_ = () => M.store.getState();
    await M.refresh();
    if (!MS_().status?.running) {
      await M.start();
      await wait(1200);
    }
    await M.refresh();
    const st = MS_().status ?? {};
    return JSON.stringify({ running: !!st.running, port: st.port, token: st.token });
  `),
);
console.log('status UI: ' + JSON.stringify({ ...jalan, token: String(jalan.token).slice(0, 8) + '…' }));
const PORT = isi().port;

const T0 = isi().token;
const a = await cek(PORT, T0);
console.log(`1) token berkas/UI ${T0.slice(0, 8)}… → HTTP ${a.status} (server harus menerimanya)`);

fs.writeFileSync(BERKAS, JSON.stringify({ token: '***', port: PORT }, null, 2));
console.log('2) berkas dibuat basi: token "***"');

await cdp.runAsync('await M.refresh(); await wait(300); return 1;');
const T1 = isi().token;
const b = await cek(PORT, T1);
console.log(`3) sesudah refresh: token berkas ${T1.slice(0, 8)}… → HTTP ${b.status}`);
console.log(`4) token lama ${T0.slice(0, 8)}… → HTTP ${(await cek(PORT, T0)).status}`);

const lulus = a.status === 200 && b.status === 200;
console.log(`\nVERDICT drift-token: ${lulus ? 'LULUS - berkas mcp.json adalah sumber kebenaran; server selalu mengikuti' : 'GAGAL'}`);
try {
  cdp.close();
} catch {
  /* tidak apa-apa */
}
