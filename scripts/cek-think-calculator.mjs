/*
 * Membuktikan think + calculator (pola OpenJarvis) benar-benar bisa dipanggil
 * agen di aplikasi hidup: terdaftar, melewati sekat TANPA izin (effect read),
 * dan hasilnya benar. Pola sama seperti cek-web-tool-aktif.mjs: yang diuji
 * store hidup di dalam aplikasi, bukan daftar di berkas.
 *
 * Dipakai: node scripts/cek-think-calculator.mjs [port-cdp, default 9223]
 */
const PORT = process.argv[2] || '9223';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.url && /localhost:517\d/.test(t.url));
if (!target) {
  console.error('Zephyr (dev) tidak ditemukan. Targets: ' + list.map((t) => t.title).join(', '));
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const cdp = async (expression) => {
  const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const raw = m?.result?.result?.value;
  if (!raw) throw new Error('gagal membaca bridge: ' + JSON.stringify(m).slice(0, 300));
  return raw;
};

let gagal = 0;
const cek = (nama, syarat, bukti) => {
  console.log(`${syarat ? '  OK  ' : '  GAGAL'} ${nama}${bukti ? ' -> ' + String(bukti).slice(0, 90) : ''}`);
  if (!syarat) gagal++;
};

// Lewat registry yang sama dengan jalur chat (periksaSekat), bukan import().
const hasil = await cdp(`(() => (async () => {
  const g = window.__ZEPHYR_TOOLS__;
  if (!g) return JSON.stringify({ err: 'bridge __ZEPHYR_TOOLS__ tidak ada' });
  const out = {};
  for (const [nama, args] of [
    ['think', { thought: 'rencana: baca dulu, lalu edit' }],
    ['calculator', { expression: '(1200 * 1.11) + 45' }],
    ['calculator', { expression: '2 + 3 * 4' }],
    ['calculator', { expression: '10 / 0' }],
    ['calculator', { expression: 'process.exit(1)' }],
  ]) {
    try {
      const r = await g.jalankan(nama, args);
      out[nama + '|' + JSON.stringify(args)] = typeof r === 'string' ? r.slice(0, 120) : JSON.stringify(r).slice(0, 120);
    } catch (e) {
      out[nama + '|' + JSON.stringify(args)] = 'LEMPAR: ' + String(e && e.message ? e.message : e).slice(0, 120);
    }
  }
  out.jumlah = g.nama().length;
  return JSON.stringify(out);
})())()`);
const H = JSON.parse(hasil);

cek('think terdaftar + melewati sekat', (H['think|{"thought":"rencana: baca dulu, lalu edit"}'] ?? '').includes('pemikiran tercatat'), H['think|{"thought":"rencana: baca dulu, lalu edit"}']);
cek('calculator (1200*1.11)+45 = 1377', (H['calculator|{"expression":"(1200 * 1.11) + 45"}'] ?? '').includes('1377'), H['calculator|{"expression":"(1200 * 1.11) + 45"}']);
cek('calculator dahulukan kali: 2+3*4 = 14', (H['calculator|{"expression":"2 + 3 * 4"}'] ?? '').includes('= 14'), H['calculator|{"expression":"2 + 3 * 4"}']);
cek('calculator tolak bagi-nol', (H['calculator|{"expression":"10 / 0"}'] ?? '').includes('nol'), H['calculator|{"expression":"10 / 0"}']);
cek('calculator tolak injeksi kode', (H['calculator|{"expression":"process.exit(1)"}'] ?? '').match(/LEMPAR|Hanya angka/)?.length > 0, H['calculator|{"expression":"process.exit(1)"}']);
cek('registry 56 tool', H.jumlah === 56, H.jumlah + ' tool di registry');

console.log(gagal ? `\n== ${6 - gagal}/6 lulus ==` : '\n== 6/6 lulus ==');
ws.close();
process.exit(gagal ? 1 : 0);
