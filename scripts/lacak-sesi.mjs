/*
 * Kenapa run selalu dibunuh oleh sesi baru?
 *
 * Yang terlihat dari log: `activeId` berpindah 5 kali dalam 5 menit, dan setiap
 * perpindahan mematikan run yang sedang jalan ("busy=false langkah=1"). Dua
 * perpindahan bahkan hanya 5 detik terpisah - itu bukan pengguna mengetik dua
 * pesan.
 *
 * Daripada menebak siapa yang memanggil newChat, keadaan store dicatat tiap
 * detik: activeId, jumlah sesi, busy, dan jumlah pesan sesi aktif. Dari
 * URUTANNYA akan terlihat apakah sesi ditambah, diganti, atau daftarnya
 * dibangun ulang.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
if (!page) {
  console.log('Zephyr tidak ketemu');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
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
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) {
    return 'GALAT: ' + String(r.result.exceptionDetails.exception?.description ?? '').split('\n')[0];
  }
  return r.result?.result?.value;
};

const jam = () => new Date().toLocaleTimeString('id-ID');
const menit = Number(process.argv[2] ?? 5);
const akhir = Date.now() + menit * 60 * 1000;
let lalu = null;

console.log(`mencatat keadaan sesi selama ${menit} menit...\n`);

while (Date.now() < akhir) {
  const r = await ev(`(() => {
    const a = window.__ZEPHYR_AI__.store.getState();
    const aktif = a.sessions.find(x => x.id === a.activeId);
    return JSON.stringify({
      id: a.activeId,
      sesi: a.sessions.length,
      pesanAktif: aktif ? (aktif.messages || []).length : -1,
      busy: a.agentBusy,
      phase: a.agentPhase,
      tool: (a.agentSteps || []).filter(x => x.kind === 'tool').length,
    });
  })()`);

  if (typeof r === 'string' && r.startsWith('{')) {
    const s = JSON.parse(r);
    const ringkas = `${s.id} sesi=${s.sesi} pesan=${s.pesanAktif} busy=${s.busy} tool=${s.tool}`;
    if (ringkas !== lalu) {
      console.log(`[${jam()}] ${ringkas}`);
      lalu = ringkas;
    }
  }
  await new Promise((res) => setTimeout(res, 1000));
}

/* Siapa yang memanggil newChat - ditumpuk, bukan ditebak. */
console.log('\n=== pemanggil newChat terakhir (kalau bisa ditangkap) ===');
console.log(
  await ev(`(() => {
  const a = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({
    sesiSemua: a.sessions.map(s => ({ id: s.id, judul: s.title, pesan: (s.messages||[]).length })),
    aktif: a.activeId,
  }, null, 1);
})()`),
);

ws.close();
