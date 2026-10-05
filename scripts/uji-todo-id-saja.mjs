/*
 * Kenapa `{id, status}` TANPA title masih ditolak?
 *
 * Bukti dari aplikasi hidup, args yang dikirim model:
 *   {"todos":[{"id":"1","status":"completed"},{"id":"2","status":"in_progress"}]}
 * hasil: ERROR: tidak ada tugas yang diterima karena teksnya kosong
 *
 * Perbaikan yang sudah dipasang: entri dikenali lewat `id` lebih dulu, dan
 * `content` kosong dikirim sebagai undefined. Kalau tetap gagal, sebabnya harus
 * dilihat dari daftar tugas yang ADA SAAT ITU - kalau tugasnya belum ada di
 * daftar, `id` tidak menunjuk ke mana-mana dan teksnya memang tidak bisa
 * ditemukan.
 *
 * Jadi diuji berurutan, meniru urutan sungguhnya:
 *   1. buat 5 tugas lengkap (mirip apa yang dilakukan model di awal)
 *   2. perbarui DENGAN ID SAJA - bentuk yang gagal itu
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
const jalan = async (nama, expr, ms = 30000) => {
  await send('Runtime.evaluate', {
    expression: `window.__z_${nama} = { selesai: false };
      (async () => { try { window.__z_${nama} = { selesai: true, nilai: await (${expr}) }; }
        catch (e) { window.__z_${nama} = { selesai: true, galat: String(e && e.message || e) }; } })();`,
  });
  const mulai = Date.now();
  while (Date.now() - mulai < ms) {
    const v = await ev(`JSON.stringify(window.__z_${nama})`);
    if (v && v !== 'undefined') {
      const p = JSON.parse(v);
      if (p?.selesai) return p.galat ? { GALAT: p.galat } : p.nilai;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { TIMEOUT: true };
};

console.log('=== 1. daftar tugas SEKARANG (sebelum uji) ===');
console.log(await ev(`JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentTodos, null, 1)`));

console.log('\n=== 2. buat 5 tugas lengkap (meniru langkah awal model) ===');
const buat = await jalan(
  'buat',
  `window.__ZEPHYR_TOOLS__.jalankan('todo_write', { todos: [
    { id: '1', title: 'Buat folder situs', status: 'completed' },
    { id: '2', title: 'Tulis index.html', status: 'in_progress' },
    { id: '3', title: 'Tulis styles.css', status: 'pending' },
    { id: '4', title: 'Tulis script.js', status: 'pending' },
    { id: '5', title: 'Verifikasi di browser', status: 'pending' },
  ] })`,
);
console.log('  ->', typeof buat === 'string' ? buat : JSON.stringify(buat));

console.log('\n=== 3. daftar tugas setelah dibuat ===');
console.log(await ev(`JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentTodos, null, 1)`));

console.log('\n=== 4. perbarui DENGAN ID SAJA - bentuk yang GAGAL itu ===');
const up = await jalan(
  'up',
  `window.__ZEPHYR_TOOLS__.jalankan('todo_write', { todos: [
    { id: '1', status: 'completed' },
    { id: '2', status: 'completed' },
  ] })`,
);
console.log('  ->', typeof up === 'string' ? up : JSON.stringify(up));

console.log('\n=== 5. daftar tugas setelah perbarui ===');
console.log(await ev(`JSON.stringify(window.__ZEPHYR_AI__.store.getState().agentTodos, null, 1)`));

ws.close();
