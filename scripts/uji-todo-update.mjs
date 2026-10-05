/*
 * Bisakah to-do list ditandai selesai?
 *
 * Yang gagal sebelumnya, dari aplikasi hidup:
 *   todo_write([{id:'1',status:'completed'}, ...])
 *   -> ERROR: tidak ada tugas yang diterima karena teksnya kosong.
 *
 * Penyebabnya: skema mengajarkan `id` sebagai identitas tetap, tapi kodenya
 * mensyaratkan teks di SETIAP entri dan mencocokkan lewat teks. Model yang
 * memakai id - tafsir yang wajar - selalu gagal.
 *
 * Yang dibuktikan:
 *   1. tugas BARU bisa dibuat (teks lengkap)
 *   2. tugas yang SUDAH ada bisa ditandai selesai dengan ID SAJA
 *   3. teksnya tidak hilang saat ditandai selesai (id benar-benar dipakai)
 *   4. entri tanpa id DAN tanpa teks tetap ditolak (bukan dilonggarkan total)
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && /zephyr|5173/i.test(t.title + t.url));
if (!page) {
  console.log('Zephyr tidak ketemu');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
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
await new Promise((r) => (ws.onopen = r));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    return { GALAT: String(d.exception?.description ?? d.text ?? '').split('\n')[0] };
  }
  return r.result?.result?.value;
};
const jalan = async (nama, expr, ms = 30000) => {
  await send('Runtime.evaluate', {
    expression: `window.__t_${nama} = { selesai: false };
      (async () => { try { window.__t_${nama} = { selesai: true, nilai: await (${expr}) }; }
        catch (e) { window.__t_${nama} = { selesai: true, galat: String(e && e.message || e) }; } })();`,
  });
  const mulai = Date.now();
  while (Date.now() - mulai < ms) {
    const v = await ev(`JSON.stringify(window.__t_${nama})`);
    if (v && v !== 'undefined') {
      const p = JSON.parse(v);
      if (p?.selesai) return p.galat ? { GALAT: p.galat } : p.nilai;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { TIMEOUT: true };
};

let lulus = 0;
let gagal = 0;
const uji = (nama, syarat, bukti) => {
  if (syarat) {
    console.log(`  LULUS  ${nama}`);
    lulus++;
  } else {
    console.log(`  GAGAL  ${nama}${bukti !== undefined ? '  -> ' + JSON.stringify(bukti) : ''}`);
    gagal++;
  }
};

console.log('=== 1. buat tugas baru (teks lengkap) ===');
const buat = await jalan(
  'buat',
  `window.__ZEPHYR_TOOLS__.jalankan('todo_write', { todos: [
     { id: 'a1', title: 'Langkah pertama uji', status: 'in_progress' },
     { id: 'a2', title: 'Langkah kedua uji', status: 'pending' },
     { id: 'a3', title: 'Langkah ketiga uji', status: 'pending' },
   ] })`,
);
console.log('  hasil:', typeof buat === 'string' ? buat : JSON.stringify(buat));
uji('pembuatan tugas diterima', typeof buat === 'string' && /3 tugas/.test(buat), buat);

console.log('\n=== 2. tandai selesai dengan ID SAJA (ini yang dulu gagal) ===');
const update = await jalan(
  'update',
  `window.__ZEPHYR_TOOLS__.jalankan('todo_write', { todos: [
     { id: 'a1', status: 'completed' },
     { id: 'a2', status: 'completed' },
     { id: 'a3', status: 'completed' },
   ] })`,
);
console.log('  hasil:', typeof update === 'string' ? update : JSON.stringify(update));
uji(
  'id saja TIDAK lagi ditolak',
  typeof update === 'string' && !/kosong/i.test(update),
  update,
);
uji('dilaporkan 3 tugas selesai', typeof update === 'string' && /3 tugas, 3 selesai/.test(update), update);

console.log('\n=== 3. teksnya tidak hilang (id benar-benar dipakai) ===');
const daftar = await ev(`(() => {
  const t = window.__ZEPHYR_TODO__;
  if (!t) return 'tidak ada bridge todo';
  const s = (t.store ?? t).getState ? (t.store ?? t).getState() : t;
  const todos = s.agentTodos ?? s.todos ?? null;
  return JSON.stringify(todos);
})()`);
console.log('  daftar sekarang:', typeof daftar === 'string' ? daftar.slice(0, 400) : JSON.stringify(daftar));
const isi = typeof daftar === 'string' ? daftar : '';
uji('teks tugas masih ada', /Langkah pertama uji/.test(isi), isi.slice(0, 150));
uji('statusnya completed', /completed/.test(isi), isi.slice(0, 150));

console.log('\n=== 4. entri tanpa id DAN tanpa teks tetap ditolak ===');
const kosong = await jalan(
  'kosong',
  `window.__ZEPHYR_TOOLS__.jalankan('todo_write', { todos: [{ status: 'pending' }, { status: 'pending' }] })`,
);
console.log('  hasil:', JSON.stringify(kosong));
uji(
  'entri kosong tetap ditolak',
  typeof kosong === 'object' && kosong.GALAT !== undefined && /kosong/i.test(kosong.GALAT),
  kosong,
);

ws.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
