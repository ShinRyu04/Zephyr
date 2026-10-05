/*
 * Pantauan panjang: dari kirim sampai agent benar-benar berhenti.
 *
 * Yang dipantau, tiap 5 detik:
 *   - sesi mana yang aktif (supaya ketahuan kalau pengguna berpindah)
 *   - jumlah langkah TOOL saja (penanda `mulai`/`selesai` tidak dihitung -
 *     itulah kesalahan baca yang membuat saya mengira ada langkah hilang)
 *   - berkas yang benar-benar muncul di disk
 *   - error terakhir dari log
 *
 * Berhenti lebih awal kalau agent berhenti DAN semua tugas selesai.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const AKAR = 'D:/Talos';

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
      else hasil.push({ n: p.replace(AKAR.replace(/\//g, '\\') + '\\', ''), ukuran: s.size, pada: s.mtimeMs });
    }
  };
  jalan(AKAR.replace(/\//g, '\\'));
  return hasil.sort((a, b) => a.pada - b.pada);
};

const menit = Number(process.argv[2] ?? 10);
const akhir = Date.now() + menit * 60 * 1000;
const terlihat = new Set();
let sesiTerakhir = null;
let mulai = false;

console.log(`memantau sampai ${menit} menit...\n`);

while (Date.now() < akhir) {
  const r = await ev(`(() => {
    const a = window.__ZEPHYR_AI__.store.getState();
    const tools = (a.agentSteps || []).filter(x => x.kind === 'tool');
    return JSON.stringify({
      sesi: a.activeId,
      busy: a.agentBusy,
      phase: a.agentPhase,
      tool: tools.length,
      alatTerakhir: tools.length ? tools[tools.length - 1].name : null,
      gagal: a.agentFailure ?? null,
      toast: a.toast ?? null,
    });
  })()`);

  const b = daftarBerkas();
  for (const f of b) {
    if (!terlihat.has(f.n)) {
      terlihat.add(f.n);
      console.log(`  BARU   ${f.n}  (${f.ukuran} byte)`);
    }
  }

  if (typeof r === 'string' && r.startsWith('{')) {
    const s = JSON.parse(r);
    if (s.sesi !== sesiTerakhir) {
      if (sesiTerakhir !== null) console.log(`  !! SESI BERPINDAH: ${sesiTerakhir} -> ${s.sesi}`);
      sesiTerakhir = s.sesi;
      console.log(`  sesi: ${s.sesi}`);
    }
    const kunci = `${s.busy}|${s.tool}|${s.phase}`;
    if (kunci !== global.__akhir) {
      console.log(
        `[${new Date().toLocaleTimeString('id-ID')}] busy=${s.busy} phase=${s.phase} tool=${s.tool}` +
          (s.alatTerakhir ? ` (${s.alatTerakhir})` : '') +
          (s.gagal ? `  GAGAL: ${String(s.gagal).slice(0, 100)}` : '') +
          (s.toast ? `  toast: ${String(s.toast).slice(0, 80)}` : ''),
      );
      global.__akhir = kunci;
    }
    if (s.busy) mulai = true;
    if (mulai && !s.busy) {
      console.log('\nagent berhenti.');
      break;
    }
  }

  await new Promise((res) => setTimeout(res, 5000));
}

console.log('\n=== berkas akhir di Talos ===');
const b = daftarBerkas();
if (!b.length) console.log('  (kosong)');
for (const f of b) console.log(`  ${f.n.padEnd(28)} ${String(f.ukuran).padStart(8)} byte`);

console.log('\n=== langkah tool lengkap ===');
console.log(
  await ev(`JSON.stringify((window.__ZEPHYR_AI__.store.getState().agentSteps || [])
    .filter(x => x.kind === 'tool')
    .map(x => ({ nama: x.name, hasil: String(x.result ?? '').slice(0, 140), ok: x.ok })), null, 1)`),
);

console.log('\n=== error terakhir di log ===');
try {
  const log = readFileSync(
    path.join(process.env.APPDATA, 'zephyr', 'logs', `zephyr-${new Date().toISOString().slice(0, 10)}.log`),
    'utf8',
  );
  const baris = log.split('\n').filter((l) => l.includes('ERROR') || l.includes('unhandledrejection'));
  console.log(baris.length ? baris.slice(-5).join('\n') : '  tidak ada error');
} catch (e) {
  console.log('  log tidak terbaca: ' + e.message);
}

ws.close();
