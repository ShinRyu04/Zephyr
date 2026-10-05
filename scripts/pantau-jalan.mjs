/*
 * Pantauan lengkap: setiap langkah, tiap 5 detik, sampai agent berhenti.
 *
 * Menampilkan alat, argumen singkatnya, dan hasilnya - termasuk hasil yang
 * KOSONG. Hasil kosong pada langkah yang jalan itu mencurigakan: bisa berarti
 * toolnya belum selesai, atau hasilnya tidak tersimpan.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
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

const menit = Number(process.argv[2] ?? 6);
const akhir = Date.now() + menit * 60 * 1000;
let terakhir = -1;

console.log(`memantau ${menit} menit...\n`);
while (Date.now() < akhir) {
  const r = await ev(`(() => {
    const a = window.__ZEPHYR_AI__.store.getState();
    return JSON.stringify({
      busy: a.agentBusy,
      phase: a.agentPhase,
      steps: (a.agentSteps || []).length,
      pesan: (a.messages || []).length,
      gagal: a.agentFailure ?? null,
    });
  })()`);
  if (typeof r === 'string' && r.startsWith('{')) {
    const s = JSON.parse(r);
    if (s.steps !== terakhir || s.busy) {
      console.log(
        `[${new Date().toLocaleTimeString('id-ID')}] busy=${s.busy} phase=${s.phase} langkah=${s.steps} pesan=${s.pesan}` +
          (s.gagal ? `  GAGAL: ${String(s.gagal).slice(0, 120)}` : ''),
      );
      terakhir = s.steps;
    }
    if (!s.busy && s.steps > 0) {
      console.log('\nagent berhenti. langkah lengkap:');
      const langkah = await ev(`JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentSteps.map(x => ({
        nama: x.name, args: String(x.args ?? '').slice(0, 90), hasil: String(x.result ?? '').slice(0, 200), ok: x.ok
      })), null, 1)`);
      console.log(langkah);
      break;
    }
  }
  await new Promise((res) => setTimeout(res, 5000));
}

console.log('\n=== berkas di Talos ===');
ws.close();
