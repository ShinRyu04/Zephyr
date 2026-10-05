/*
 * Pemantauan BERKELANJUTAN: menunggu run baru, lalu melaporkan sampai agent
 * berhenti - berapa kali pun itu terjadi dalam jendela waktu yang diberikan.
 *
 * Berbeda dari pantau-panjang.mjs yang berhenti pada akhir run PERTAMA. Yang
 * dibutuhkan sekarang: kalau pengguna mengirim lagi, pantauan harus ikut
 * mengikuti, bukan ikut berhenti.
 *
 * Yang dicatat:
 *   - run baru dibedakan dari jumlah langkah yang MENGECIL (run baru) atau
 *     sesi yang berpindah
 *   - setiap berkas baru di disk, beserta waktunya
 *   - setiap tool, dan hasilnya kalau GAGAL
 *   - sebab berhenti: watchdog, selesai, atau gagal
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const AKAR = 'D:\\Talos';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
if (!page) {
  console.log('Zephyr tidak ketemu di 9223');
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

const daftarBerkas = () => {
  const hasil = [];
  const jalan = (d) => {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      const s = statSync(p);
      if (s.isDirectory()) jalan(p);
      else hasil.push({ n: p.replace(AKAR + '\\', ''), ukuran: s.size });
    }
  };
  jalan(AKAR);
  return hasil;
};

const jam = () => new Date().toLocaleTimeString('id-ID');
const menit = Number(process.argv[2] ?? 15);
const akhir = Date.now() + menit * 60 * 1000;
const terlihat = new Set();
let sesiLalu = null;
let jumlahLalu = -1;
const riwayat = [];

console.log(`memantau ${menit} menit, mengikuti run BERULANG...\n`);

while (Date.now() < akhir) {
  for (const f of daftarBerkas()) {
    if (!terlihat.has(f.n)) {
      terlihat.add(f.n);
      console.log(`  [${jam()}] BERKAS BARU  ${f.n}  (${f.ukuran} byte)`);
    }
  }

  const r = await ev(`(() => {
    const a = window.__ZEPHYR_AI__.store.getState();
    const t = (a.agentSteps || []).filter(x => x.kind === 'tool');
    return JSON.stringify({
      sesi: a.activeId, busy: a.agentBusy, phase: a.agentPhase, jumlah: t.length,
      alat: t.length ? t[t.length - 1].name : null,
      ok: t.length ? t[t.length - 1].ok : null,
      gagal: a.agentFailure ?? null,
    });
  })()`);

  if (typeof r === 'string' && r.startsWith('{')) {
    const s = JSON.parse(r);

    if (s.sesi !== sesiLalu) {
      console.log(`  [${jam()}] SESI: ${s.sesi}${sesiLalu ? ' (dari ' + sesiLalu + ')' : ''}`);
      sesiLalu = s.sesi;
      jumlahLalu = -1;
    }

    /* Jumlah langkah MENGECIL berarti run baru di sesi yang sama. */
    if (s.jumlah < jumlahLalu) {
      const akhirRun = riwayat.length ? riwayat[riwayat.length - 1] : null;
      if (akhirRun) {
        console.log(`  [${jam()}] --- RUN BARU (run sebelumnya: ${akhirRun.jumlah} langkah) ---`);
      }
    }

    const kunci = `${s.busy}|${s.jumlah}|${s.alat}|${s.ok}`;
    if (kunci !== global.__k) {
      console.log(
        `  [${jam()}] busy=${s.busy} phase=${s.phase} langkah=${s.jumlah}` +
          (s.alat ? ` (${s.alat}${s.ok === false ? ' GAGAL' : ''})` : '') +
          (s.gagal ? `  GAGAL: ${String(s.gagal).slice(0, 90)}` : ''),
      );
      global.__k = kunci;
    }

    if (s.busy) {
      if (jumlahLalu !== s.jumlah && !riwayat.some((x) => x.jumlah === s.jumlah && x.sesi === s.sesi)) {
        riwayat.push({ sesi: s.sesi, jumlah: s.jumlah, pada: jam() });
      }
    } else if (jumlahLalu > 0) {
      console.log(`  [${jam()}] --- RUN BERHENTI pada ${jumlahLalu} langkah ---\n`);
    }
    jumlahLalu = s.jumlah;
  }

  await new Promise((res) => setTimeout(res, 5000));
}

console.log('\n=== berkas akhir ===');
const b = daftarBerkas();
if (!b.length) console.log('  (kosong)');
for (const f of b) console.log(`  ${f.n.padEnd(28)} ${String(f.ukuran).padStart(8)} byte`);

console.log('\n=== SEMUA langkah run terakhir ===');
console.log(
  await ev(`JSON.stringify((window.__ZEPHYR_AI__.store.getState().agentSteps || [])
    .filter(x => x.kind === 'tool')
    .map(x => ({ nama: x.name, ok: x.ok, hasil: String(x.result ?? '').replace(/\\s+/g,' ').slice(0, 130) })), null, 1)`),
);

ws.close();
