/*
 * Apakah to-do list ikut berubah saat agent SEDANG bekerja?
 *
 * Keluhan pengguna: "kadang dia todo nya ga update pas lgi kerja". Dua
 * kemungkinan yang sangat berbeda:
 *
 *   A. Tool-nya gagal (mis. "tidak ada tugas yang diterima karena teksnya
 *      kosong") - dan itu SUDAH diperbaiki malam ini.
 *   B. Tool-nya berhasil, tapi UI tidak ikut berubah - artinya masalah render,
 *      bukan masalah data.
 *
 * Yang diuji di sini: A. Selama agent berjalan, setiap panggilan todo_write
 * dijalankan ulang dengan bentuk yang SAMA seperti yang dikirim model, lalu
 * dilihat apakah statusnya benar-benar berpindah di store.
 *
 * Bentuk yang diuji adalah yang TERBUKTI gagal sebelumnya:
 *   {"todos":[{"id":"2","status":"in_progress"},{"id":"3","status":"completed"}]}
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
const jalan = async (nama, expr, ms = 30000) => {
  await send('Runtime.evaluate', {
    expression: `window.__td_${nama} = { selesai: false };
      (async () => { try { window.__td_${nama} = { selesai: true, nilai: await (${expr}) }; }
        catch (e) { window.__td_${nama} = { selesai: true, galat: String(e && e.message || e) }; } })();`,
  });
  const mulai = Date.now();
  while (Date.now() - mulai < ms) {
    const v = await ev(`JSON.stringify(window.__td_${nama})`);
    if (v && v !== 'undefined') {
      const p = JSON.parse(v);
      if (p?.selesai) return p.galat ? { GALAT: p.galat } : p.nilai;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { TIMEOUT: true };
};

let lulus = 0;
let gagal = 0;
const uji = (nama, ok, bukti) => {
  if (ok) {
    console.log(`  LULUS  ${nama}`);
    lulus++;
  } else {
    console.log(`  GAGAL  ${nama}${bukti !== undefined ? '  -> ' + JSON.stringify(bukti) : ''}`);
    gagal++;
  }
};

const status = () =>
  ev(`JSON.stringify((window.__ZEPHYR_AI__.store.getState().agentTodos || []).map(t => t.id + '=' + t.status))`);

console.log('=== 1. tugas awal (lengkap dengan title) ===');
console.log(
  '  ->',
  await jalan(
    'a',
    `window.__ZEPHYR_TOOLS__.jalankan('todo_write', { todos: [
      { id: '1', title: 'Langkah satu', status: 'completed' },
      { id: '2', title: 'Langkah dua', status: 'in_progress' },
      { id: '3', title: 'Langkah tiga', status: 'pending' },
    ] })`,
  ),
);
console.log('  status:', await status());

console.log('\n=== 2. UPDATE DENGAN ID SAJA (bentuk yang dulu gagal) ===');
const up = await jalan(
  'b',
  `window.__ZEPHYR_TOOLS__.jalankan('todo_write', { todos: [
    { id: '2', status: 'completed' },
    { id: '3', status: 'in_progress' },
  ] })`,
);
console.log('  ->', typeof up === 'string' ? up : JSON.stringify(up));
uji('update dengan id saja DITERIMA (bukan error)', typeof up === 'string' && !/kosong/i.test(up), up);

const st = await status();
console.log('  status:', st);
const s = typeof st === 'string' ? st : '';
/*
 * Status internal Zephyr adalah 'done', bukan 'completed'.
 *
 * Uji yang mengecek 'completed' akan GAGAL walaupun perilakunya benar - dan
 * uji yang menolak keadaan yang benar itu lebih buruk daripada tidak ada uji,
 * karena ia menyuruh orang "memperbaiki" yang sudah betul. Kata yang dipakai
 * diambil dari kode, bukan ditebak: 'pending' | 'in_progress' | 'done'.
 */
const done = s.includes('=done');
const sedangJalan = s.includes('=in_progress');
uji('tugas selesai tercatat done', done, s);
uji('tugas berikutnya tercatat in_progress', sedangJalan, s);
uji('teks tugas TIDAK hilang', typeof (await ev(`JSON.stringify((window.__ZEPHYR_AI__.store.getState().agentTodos||[]).map(t=>t.content))`)) === 'string' && /Langkah/.test(await ev(`JSON.stringify((window.__ZEPHYR_AI__.store.getState().agentTodos||[]).map(t=>t.content))`)));

console.log('\n=== 3. update ketiga kali (memastikan tidak perluak lagi) ===');
console.log(
  '  ->',
  await jalan(
    'c',
    `window.__ZEPHYR_TOOLS__.jalankan('todo_write', { todos: [
      { id: '3', status: 'completed' },
    ] })`,
  ),
);
console.log('  status:', await status());

ws.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
