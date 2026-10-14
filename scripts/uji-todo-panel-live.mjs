/*
 * Bukti LIVE panel todo: batas jumlah tugas & tombol bersih.
 *
 * Dua cacat yang diukur di sini, keduanya ketemu dari pemakaian nyata:
 *
 *   1. MAX_TODOS = 20 memotong daftar panjang DIAM-DIAM. 68 tugas dikirim,
 *      tersimpan 20, dan 48 baris hilang tanpa satu pun pesan. Aturannya
 *      sekarang: batasnya 200 DAN setiap pemotongan wajib dilaporkan di hasil
 *      tool (yang dibaca pengguna maupun model).
 *   2. Tombol "Clear completed tasks" dan "Clear all tasks" tidak melakukan
 *      apa pun, karena keduanya lewat setAgentTodos() - fungsi yang sengaja
 *      menambal-balik tugas yang tidak ikut disebut. Daftarnya hanya bisa
 *      kosong lewat reload. Sekarang keduanya memakai jalur eksplisit
 *      (buangTodosSelesai / kosongkanTodos).
 *
 * Yang diukur adalah DOM yang benar-benar dirender (baris [data-testid^=todo-]
 * di dalam [data-testid=ai-todos]), bukan nilai kembalian fungsi - nilai yang
 * benar tapi tidak terlihat pengguna bukan bukti.
 *
 * Kontrol dua sisi: daftar dikosongkan di awal, dan keadaan akhir dikembalikan
 * ke kosong supaya percobaan ini tidak meninggalkan apa pun di aplikasi.
 *
 * Jalankan: node scripts/uji-todo-panel-live.mjs   (exit 0 = lulus)
 */
const CDP = 'http://127.0.0.1:9223';

const ws = new WebSocket((await (await fetch(CDP + '/json/list')).json())
  .find((t) => /zephyr/i.test(t.title ?? ''))?.webSocketDebuggerUrl
  ?? (await (await fetch(CDP + '/json/list')).json())[0].webSocketDebuggerUrl);
let seq = 1;
const tunggu = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => new Promise((r) => {
  const id = seq++; tunggu.set(id, r); ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  const d = r.result?.exceptionDetails;
  if (d) return 'ERR ' + (d.exception?.description ?? d.text);
  return r.result?.result?.value;
};
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Runtime.enable');

/* Cacah dari DOM: berapa baris yang benar-benar dirender, dan berapa yang
   selesai. `kepotong` = selisih baris DOM vs isi store - kalau pernah tidak
   nol, ada baris yang tersimpan tapi tidak ditampilkan (atau sebaliknya). */
const baca = `(function(){
  const t = window.__ZEPHYR_TODO__.baca();
  const host = document.querySelector('[data-testid=ai-todos]');
  const rows = host ? host.querySelectorAll('[data-testid^=todo-]') : [];
  return JSON.stringify({
    store: t.length,
    done: t.filter((x) => x.status === 'done').length,
    domBaris: rows.length,
    kepotong: rows.length - t.length,
  });
})()`;

/* Tombol "..." milik tumpukan status composer dicari dari wadah yang memuat
   daftar todo - bukan tombol "..." lain di panel AI. */
const bukaMenu = `(function(){
  let a = document.querySelector('[data-testid=ai-todos]');
  while (a && !a.querySelector('button[aria-label=Options]')) a = a.parentElement;
  const b = a && a.querySelector('button[aria-label=Options]');
  if (!b) return 'tombol-tidak-ada';
  b.click(); return 'klik-ok';
})()`;
const klikMenu = (pola) => `(function(){
  const pop = document.querySelector('.composer-menu-popover');
  if (!pop) return 'popover-tidak-ada';
  const bs = Array.from(pop.querySelectorAll('button'));
  const t = bs.find((x) => new RegExp(${JSON.stringify(pola)}, 'i').test(x.textContent));
  if (!t) return 'item-tidak-ada';
  t.click(); return 'klik: ' + t.textContent.trim();
})()`;

const daftar = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({
  content: `tugas ${i + 1}`,
  status: i % 3 === 0 ? 'done' : (i % 3 === 1 ? 'in_progress' : 'pending'),
})));
const tulis = async (n) => ev(`window.__ZEPHYR_TODO__.tulis(${daftar(n)}).then((r) => JSON.stringify(r)).catch((e) => 'ERR ' + e.message)`);
const angka = async () => JSON.parse(await ev(baca));

const gagal = [];
const tolak = (syarat, pesan) => { if (!syarat) gagal.push(pesan); };

const awal = await angka();
console.log('awal:', JSON.stringify(awal));

console.log('');
console.log('[1] daftar wajar (68 tugas) harus UTUH - dulu dipotong jadi 20');
await ev(`window.__ZEPHYR_TODO__.kosongkanTodos(); 'ok'`);
await jeda(400);
const pesan68 = await tulis(68);
const a68 = await angka();
console.log('    pesan:', pesan68);
console.log('    ', JSON.stringify(a68));
tolak(a68.store === 68, `68 tugas dikirim tapi tersimpan ${a68.store} (dipotong diam-diam)`);
tolak(a68.domBaris === 68, `68 tugas tersimpan tapi hanya ${a68.domBaris} baris dirender`);
tolak(a68.kepotong === 0, `ada ${a68.kepotong} baris selisih store vs DOM`);
tolak(!/PERINGATAN/.test(pesan68), 'pemotongan dilaporkan padahal daftarnya masih di bawah batas');

console.log('');
console.log('[2] daftar di atas batas (300 tugas) harus DIPOTONG TERLAPOR, bukan senyap');
await ev(`window.__ZEPHYR_TODO__.kosongkanTodos(); 'ok'`);
await jeda(400);
const pesan300 = await tulis(300);
const a300 = await angka();
console.log('    pesan:', pesan300);
console.log('    ', JSON.stringify(a300));
tolak(/PERINGATAN/.test(pesan300) && /100/.test(pesan300), '300 tugas dipotong tanpa menyebut berapa yang hilang di hasil tool');
tolak(a300.store === 200, `batas 200 diharapkan menyimpan 200, ternyata ${a300.store}`);
tolak(a300.domBaris === a300.store, `baris dirender ${a300.domBaris} != tersimpan ${a300.store}`);
const harapSelesai = 67; /* i%3===0 untuk i<200 */
tolak(a300.done === harapSelesai, `tugas selesai diharapkan ${harapSelesai}, terukur ${a300.done}`);

console.log('');
console.log('[3] tombol "Clear completed tasks" harus benar-benar membuang yang selesai');
console.log('    menu:', await ev(bukaMenu), '|', await ev(klikMenu('Clear completed')));
await jeda(700);
const a3 = await angka();
console.log('    ', JSON.stringify(a3));
tolak(a3.done === 0, `masih ada ${a3.done} baris selesai setelah ditekan`);
tolak(a3.store === a300.store - harapSelesai, `sisa seharusnya ${a300.store - harapSelesai}, terukur ${a3.store}`);
tolak(a3.domBaris === a3.store, 'DOM tidak ikut menyusut');

console.log('');
console.log('[4] tombol "Clear all tasks" harus mengosongkan sampai benar-benar kosong');
console.log('    menu:', await ev(bukaMenu), '|', await ev(klikMenu('Clear all')));
await jeda(700);
const a4 = await angka();
console.log('    ', JSON.stringify(a4));
tolak(a4.store === 0 && a4.domBaris === 0, `daftar tidak kosong: store ${a4.store}, DOM ${a4.domBaris}`);

console.log('');
console.log('[5] kosongnya harus bertahan sesudah app dimuat ulang');
await send('Page.reload');
await jeda(9000);
const a5 = await angka();
console.log('    ', JSON.stringify(a5));
tolak(a5.store === 0 && a5.domBaris === 0, `daftar muncul lagi sesudah reload: store ${a5.store}, DOM ${a5.domBaris}`);

console.log('');
if (gagal.length) {
  console.log('GAGAL:');
  for (const g of gagal) console.log('  - ' + g);
  process.exitCode = 1;
} else {
  console.log('LULUS: daftar tugas panjang tersimpan utuh sampai batas 200, pemotongan di atas batas dilaporkan terang-terangan, dan kedua tombol bersih benar-benar mengosongkan (bertahan sesudah reload).');
}
ws.close();
