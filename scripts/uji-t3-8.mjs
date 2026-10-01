// uji-t3-8.mjs — verifikasi TODO agent (T3.8).
//
// KENAPA penting: user minta bisa MEMANTAU pekerjaan AI Zephyr. Panel TODO
// adalah alat pantau itu — tapi hanya berguna kalau:
//   1. agent benar-benar menulis TODO lewat tool (bukan hanya di prompt)
//   2. status berubah saat pekerjaan maju
//   3. panelnya ter-render dengan status yang benar
//
// Uji ini memakai TOOL ASLI agent (todo_write), bukan set state langsung —
// supaya yang dibuktikan adalah jalur yang dipakai model sungguhan.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== T3.8: TODO agent yang bisa dipantau ===\n');

// ── V1: prompt MEWAJIBKAN todo_write ──
const prompt = await cdp.json(`return JSON.stringify(await (async () => {
  const p = window.__ZEPHYR_PROMPT__.system('follow');
  return {
    wajibTodo: p.includes('todo_write'),
    sebutPanel: p.includes('panel TODO') || p.includes('memantau'),
    sebutStatus: p.includes('in_progress'),
  };
})())`, 60000);
cek('prompt mewajibkan pakai todo_write', prompt.wajibTodo === true);
cek('prompt menyebut alasan (user memantau)', prompt.sebutPanel === true);
cek('prompt menyebut transisi status', prompt.sebutStatus === true);

// ── V2: tool todo_write benar-benar menyimpan ──
const tulis = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TODO__;
  T.bersih();
  await new Promise((r) => setTimeout(r, 300));
  const hasil = await T.tulis([
    { content: 'Baca AGENTS.md', status: 'done' },
    { content: 'Perbaiki bug layout', status: 'in_progress' },
    { content: 'Rebuild rilis', status: 'pending' },
  ]);
  await new Promise((r) => setTimeout(r, 500));
  const t = T.baca();
  return {
    pesan: String(hasil),
    n: t.length,
    status: t.map((x) => x.status),
    teks: t.map((x) => x.content),
  };
})())`, 90000);
cek('tool todo_write mengembalikan konfirmasi', /3/.test(tulis.pesan), tulis.pesan);
cek('3 tugas tersimpan', tulis.n === 3, `${tulis.n} item`);
cek('status tersimpan benar', tulis.status.join(',') === 'done,in_progress,pending', tulis.status.join(','));
cek('teks tugas tersimpan', tulis.teks[0] === 'Baca AGENTS.md', tulis.teks[0]);

// ── V3: tool todo_read membacanya kembali ──
const baca = await cdp.json(`return JSON.stringify(await (async () => {
  const mod = await import('/src/lib/agentTools.ts');
  const hasil = await mod.jalankanAgentTool('todo_read', {});
  return { teks: String(hasil) };
})())`, 90000);
cek('todo_read mengembalikan daftar', baca.teks.includes('Baca AGENTS.md'), baca.teks.split('\n')[0]);

// ── V4: panel TODO ter-render dengan status yang benar ──
const panel = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  T.getState().setVisible(true);
  await new Promise((r) => setTimeout(r, 1200));
  const item = [...document.querySelectorAll('[data-todo-status]')];
  return {
    n: item.length,
    status: item.map((e) => e.getAttribute('data-todo-status')),
    teks: item.map((e) => e.textContent.trim().replace(/^[✓◔○]\\s*/, '')).slice(0, 3),
    ikon: item.map((e) => e.querySelector('.todo-ikon')?.textContent?.trim()),
  };
})())`, 90000);
cek('panel TODO menampilkan 3 item', panel.n === 3, `${panel.n} item`);
cek('status di DOM sesuai', panel.status.join(',') === 'done,in_progress,pending', panel.status.join(','));
cek('ikon status berbeda per status', new Set(panel.ikon).size === 3, panel.ikon.join(' '));

// ── V5: update status saat pekerjaan maju ──
const maju = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TODO__;
  await T.tulis([
    { content: 'Baca AGENTS.md', status: 'done' },
    { content: 'Perbaiki bug layout', status: 'done' },
    { content: 'Rebuild rilis', status: 'in_progress' },
  ]);
  await new Promise((r) => setTimeout(r, 700));
  const item = [...document.querySelectorAll('[data-todo-status]')];
  return { status: item.map((e) => e.getAttribute('data-todo-status')) };
})())`, 90000);
cek('panel ikut berubah saat status maju', maju.status.join(',') === 'done,done,in_progress', maju.status.join(','));

// ── V6: batas 20 item ditegakkan ──
const batas = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TODO__;
  const banyak = Array.from({ length: 30 }, (_, i) => ({ content: 'tugas ' + (i + 1), status: 'pending' }));
  await T.tulis(banyak);
  await new Promise((r) => setTimeout(r, 400));
  return { n: T.baca().length };
})())`, 90000);
cek('daftar dibatasi 20 item', batas.n === 20, `${batas.n} item`);

// ── bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_TODO__.bersih();
  await new Promise((r) => setTimeout(r, 300));
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
