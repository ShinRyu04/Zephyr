/**
 * shot-todo-card.mjs - tulis contoh todo lalu potret panel AI.
 * Dua kali: keadaan terbuka dan keadaan terlipat.
 *
 *   node scripts/shot-todo-card.mjs 9223
 *
 * PENTING: harness lain (verify-todo-card.mjs) membersihkan daftar todo di
 * akhir, dan panel menghilang dari DOM saat daftarnya kosong. Jadi skrip ini
 * WAJIB mengisi ulang daftarnya sebelum memotret - kalau tidak, yang tertangkap
 * adalah panel tanpa kartu sama sekali.
 */
import { Cdp, sleep } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

async function isiTodo() {
  await cdp.json(`return JSON.stringify(await (async () => {
    await window.__ZEPHYR_TODO__.bersih();
    await window.__ZEPHYR_TODO__.tulis([
      { content: 'Baca PRD dan petakan modul AI', status: 'done' },
      { content: 'Tambah startedAt/endedAt di aiStore', status: 'done' },
      { content: 'Adaptasi kartu progres ke TodoPanel', status: 'in_progress' },
      { content: 'Tulis harness verifikasi CDP', status: 'pending' },
      { content: 'Commit fase todo card', status: 'pending' },
    ]);
    return window.__ZEPHYR_TODO__.baca().length;
  })())`);
  await sleep(500);
}

async function potret(nama) {
  const info = await cdp.eval(`JSON.stringify((() => {
    const b = document.querySelector('.todo-dock');
    const k = document.querySelector('.ai-input-row');
    if (!b) return { ada: false };
    b.scrollIntoView({ block: 'center' });
    const rb = b.getBoundingClientRect();
    const rk = k ? k.getBoundingClientRect() : null;
    return {
      ada: true,
      tinggi: Math.round(rb.height),
      celahKeKotak: rk ? Math.round(rk.top - rb.bottom) : null,
    };
  })())`);
  console.log(`${nama}: ${info}`);
  await sleep(350);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const path = `D:/Zephyr/screenshots/${nama}.png`;
  writeFileSync(path, Buffer.from(shot.result.data, 'base64'));
  console.log(`tersimpan: ${path}`);
}

await isiTodo();

// pastikan mulai dari keadaan terbuka
await cdp.eval(`(() => {
  const b = document.querySelector('[data-testid="todo-lipat"]');
  if (b && b.getAttribute('aria-expanded') === 'false') b.click();
})()`);
await sleep(400);
await potret('todo-card-buka');

// lipat
await cdp.eval(`document.querySelector('[data-testid="todo-lipat"]').click()`);
await sleep(400);
await potret('todo-card-lipat');

// kembalikan ke terbuka supaya app tidak ditinggal dalam keadaan terlipat
await cdp.eval(`document.querySelector('[data-testid="todo-lipat"]').click()`);
await sleep(200);

await cdp.close();
process.exit(0);
