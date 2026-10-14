/*
 * Bisikan "permintaan MCP menggantung": cari tahu apakah server MCP Zephyr
 * macet setelah sekian permintaan (deadlock / lock bocor) - dugaan kenapa
 * verify11 berhenti tepat sesudah V9 tanpa error apa pun.
 *
 * Cara: kirim get_window bertubi-tubi lewat HTTP dengan batas waktu 5 detik,
 * cetak status + lama tiap panggilan, dan setiap 5 panggilan periksa apakah
 * kanal CDP masih hidup (kalau CDP hidup tapi HTTP menggantung = server MCP
 * yang macet, bukan aplikasinya).
 */
import { Cdp } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

/* lib-cdp hanya menyediakan S,s,X,SET,M,TS,PTY,q,qa,wait. Helper khas verify11
 * (MS, tunggu) tidak ada di sana - didefinisikan sendiri di tiap badan. */
const PRE = `
    const MS = () => M.store.getState();
    const tunggu = async (ms = 20000) => {
      const batas = Date.now() + ms;
      while (MS().busy && Date.now() < batas) await wait(80);
      await wait(120);
      return !MS().busy;
    };
`;

const st = JSON.parse(
  await cdp.runAsync(`
    ${PRE}
    await M.refresh();
    if (!(MS().status?.running)) { await M.toggle(true); await tunggu(); await wait(800); }
    await M.refresh();
    const s2 = MS().status ?? {};
    return JSON.stringify({ running: !!s2.running, port: s2.port ?? null, token: s2.token ?? null });
  `),
);
const PORT = Number(st.port);
const TOKEN = st.token;
console.log(`server MCP: running=${st.running} port=${PORT}`);

const panggil = async (i) => {
  const t0 = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'get_window', params: {} }),
      signal: AbortSignal.timeout(5000),
    });
    const teks = await res.text();
    return `HTTP ${res.status} (${Date.now() - t0}ms) ${teks.slice(0, 40)}`;
  } catch (e) {
    return `MACET/GAGAL (${Date.now() - t0}ms) ${e.name}: ${e.message}`;
  }
};

let macet = 0;
for (let i = 1; i <= 40; i++) {
  const hasil = await panggil(i);
  console.log(`#${String(i).padStart(2)} ${hasil}`);
  if (hasil.startsWith('MACET')) {
    macet = i;
    break;
  }
  if (i % 5 === 0) {
    const cdpHidup = await cdp
      .eval('1+1')
      .then((v) => `hidup (${v})`)
      .catch((e) => `MATI: ${e.message}`);
    console.log(`      ..kanal CDP: ${cdpHidup}`);
  }
}

/* Apakah UI masih menjawab saat HTTP macet? */
const uiHidup = await cdp
  .runAsync(
    `${PRE}
     await M.refresh();
     return JSON.stringify({ busy: !!MS().busy, served: MS().served, err: MS().mcpError ?? null });`,
    25000,
  )
  .then((v) => v)
  .catch((e) => `GAGAL: ${e.message}`);
console.log(`status UI sesudahnya: ${uiHidup}`);
console.log(macet ? `\nVERDICT: server MCP MACET pada permintaan ke-${macet}` : '\nVERDICT: 40 permintaan lancar semua');

try {
  await cdp.runAsync(`${PRE} await M.toggle(false); await tunggu(); return 'ok';`, 20000);
} catch {
  /* biarkan */
}
try {
  cdp.close();
} catch {
  /* tidak apa-apa */
}
