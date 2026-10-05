/*
 * Rekam SETIAP tool yang GAGAL, beserta pesan errornya, SAAT ITU JUGA.
 *
 * Sesi baru mengosongkan agentSteps, jadi memeriksa sesudah run selesai selalu
 * terlambat - langkah gagal tadi sudah hilang. Yang benar: baca berulang
 * selama run berjalan, dan cetak hasil GAGAL begitu terlihat.
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
const menit = Number(process.argv[2] ?? 10);
const akhir = Date.now() + menit * 60 * 1000;
const tercatat = new Set();

console.log(`merekam tool yang GAGAL selama ${menit} menit...\n`);

while (Date.now() < akhir) {
  const r = await ev(`JSON.stringify((window.__ZEPHYR_AI__.store.getState().agentSteps || [])
    .filter(x => x.kind === 'tool')
    .map((x, i) => ({ i, nama: x.name, ok: x.ok, args: String(x.args ?? ''), hasil: String(x.result ?? '') })))`);

  if (typeof r === 'string' && r.startsWith('[')) {
    for (const s of JSON.parse(r)) {
      const kunci = `${s.i}|${s.nama}|${s.hasil.slice(0, 60)}`;
      if (tercatat.has(kunci)) continue;
      tercatat.add(kunci);

      if (s.ok === false) {
        console.log(`[${jam()}] GAGAL  ${s.nama}`);
        console.log(`         args  : ${s.args.replace(/\s+/g, ' ').slice(0, 300)}`);
        console.log(`         hasil : ${s.hasil.replace(/\s+/g, ' ').slice(0, 400)}`);
        console.log('');
      } else {
        console.log(`[${jam()}] ok     ${s.nama}  -> ${s.hasil.replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }
  }
  await new Promise((res) => setTimeout(res, 2500));
}

ws.close();
