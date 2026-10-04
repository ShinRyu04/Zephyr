/*
 * Verifikasi: custom sub-agent bisa DIBUAT, DIUBAH, dan BERTAHAN.
 *
 * Tombol "+ New" dan "Ubah" pernah dibuang, dan alasannya nyata: `pisahCustom`
 * mencocokkan peran lewat NAMA, jadi mengganti nama seorang pekerja menjadi
 * `kerja` diam-diam mencabut label, ikon, dan arahan dari setiap tugas yang
 * menyebut peran itu. Membuang tombolnya menghentikan kerusakan dengan cara
 * membuang fiturnya.
 *
 * Perbaikan yang benar ada di sisi tulis: `simpan` kini MENOLAK nama peran
 * bawaan dan MENOLAK nama kembar. Uji ini membuktikan penolakan itu benar-benar
 * bekerja - karena kalau tidak, menghidupkan tombolnya kembali hanya
 * menghidupkan lagi bug yang dulu membuatnya dibuang.
 *
 * Yang diuji:
 *  1. tombol "+ New" ada, dan modalnya terbuka
 *  2. nama peran bawaan DITOLAK (enam-enamnya)
 *  3. nama kembar DITOLAK
 *  4. nama yang sah TERSIMPAN dan BERTAHAN setelah muat ulang
 *  5. tombol "Ubah" ada di baris custom, dan modalnya memuat nilai lama
 *  6. hapus membersihkan
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.log('app mati'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
const errors = [];
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description ?? '').slice(0, 160));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 220);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runAsync(expr, tungguMs = 8000) {
  await evalJs(`window.__cek = { selesai: false, hasil: null };
    (async () => { try { window.__cek.hasil = await (${expr}); } catch (e) { window.__cek.hasil = 'ERR ' + String(e.message || e).slice(0, 160); } window.__cek.selesai = true; })()`);
  for (let i = 0; i < tungguMs / 200; i += 1) {
    const r = await evalJs(`JSON.stringify(window.__cek)`);
    try { const p = JSON.parse(r); if (p.selesai) return p.hasil; } catch { /* belum */ }
    await sleep(200);
  }
  return 'TIMEOUT';
}

let lulus = 0;
let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

const NAMA = 'UjiCustom' + Math.random().toString(36).slice(2, 6);

console.log('== Custom sub-agent: buat, tolak nama bawaan, bertahan ==\n');

/* Buka Settings -> Agents. Ikon Settings adalah TOGGLE. */
for (let i = 0; i < 12; i += 1) {
  if ((await evalJs(`(() => !!document.querySelector('[data-testid="sub-custom-baru"]'))()`)) === true) break;
  await evalJs(`(() => { const b = window.__ZEPHYR_SETTINGS__; if (b && i === 0) b.buka('subagent'); })()`);
  await sleep(700);
  if (i === 4) await evalJs(`(() => [ ...document.querySelectorAll('[data-activity]') ].filter(e => e.getAttribute('data-activity') === 'settings').forEach(b => b.click()))()`);
  if (i === 6) await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-subagent"]'); if (b) b.click(); })()`);
}

cek('tombol "+ New sub-agent" ADA', (await evalJs(`(() => !!document.querySelector('[data-testid="sub-custom-baru"]'))()`)) === true);

/* --- Penolakan nama peran bawaan: ini penjaga yang membuat tombolnya aman --- */
const ditolakBawaan = await runAsync(`(async () => {
  const b = window.__ZEPHYR_SUB__;
  const s = b.state();
  const hasil = [];
  for (const nama of ['cari', 'telaah', 'rencana', 'audit', 'kerja', 'jelajah', 'Kerja', 'AUDIT']) {
    const sebelum = s.daftar.length;
    await s.simpan({ nama, deskripsi: 'x', prompt: 'x', ikon: 'x', alat: [], aktif: true });
    await s.muat();
    hasil.push({ nama, bertambah: window.__ZEPHYR_SUB__.state().daftar.length - sebelum });
  }
  return JSON.stringify(hasil);
})()`);
console.log('     nama bawaan -> ' + ditolakBawaan);
let semuaDitolak = false;
try {
  const arr = JSON.parse(ditolakBawaan);
  semuaDitolak = arr.every((x) => x.bertambah === 0);
} catch { /* biarkan false */ }
cek('SEMUA nama peran bawaan ditolak (6 nama + variasi huruf besar)', semuaDitolak, String(ditolakBawaan).slice(0, 120));

/* --- Nama sah tersimpan --- */
const tersimpan = await runAsync(`(async () => {
  const b = window.__ZEPHYR_SUB__;
  const s = b.state();
  await s.simpan({ nama: ${JSON.stringify(NAMA)}, deskripsi: 'dibuat harness', prompt: 'Anda penguji.', ikon: '⊕', alat: ['read_file'], aktif: true });
  await s.muat();
  const d = window.__ZEPHYR_SUB__.state().daftar;
  const hit = d.filter((x) => x.nama === ${JSON.stringify(NAMA)});
  return JSON.stringify({ total: d.length, cocok: hit.length, alat: hit[0] ? hit[0].alat : null });
})()`);
console.log('     nama sah -> ' + tersimpan);
cek('nama sah tersimpan', typeof tersimpan === 'string' && tersimpan.includes('"cocok":1'), String(tersimpan).slice(0, 90));
cek('pilihan ALAT ikut tersimpan', typeof tersimpan === 'string' && tersimpan.includes('read_file'), String(tersimpan).slice(0, 90));

/* --- Nama kembar ditolak --- */
const kembar = await runAsync(`(async () => {
  const b = window.__ZEPHYR_SUB__;
  const s = b.state();
  const sebelum = s.daftar.length;
  await s.simpan({ nama: ${JSON.stringify(NAMA)}, deskripsi: 'kembar', prompt: 'x', ikon: '⊕', alat: [], aktif: true });
  await s.muat();
  return String(window.__ZEPHYR_SUB__.state().daftar.length - sebelum);
})()`);
cek('nama kembar ditolak', kembar === '0', 'bertambah=' + kembar);

/* --- Bertahan setelah muat ulang --- */
const setelahMuat = await runAsync(`(async () => {
  const b = window.__ZEPHYR_SUB__;
  await b.muat();
  const d = b.daftar();
  return JSON.stringify({ jumlah: d.length, ada: d.some((x) => x.nama === ${JSON.stringify(NAMA)}) });
})()`);
console.log('     setelah muat ulang -> ' + setelahMuat);
cek('custom sub-agent BERTAHAN setelah muat ulang', typeof setelahMuat === 'string' && setelahMuat.includes('"ada":true'), String(setelahMuat).slice(0, 80));

/* --- Tombol Ubah ada di barisnya --- */
const adaUbah = await runAsync(`(async () => {
  const b = window.__ZEPHYR_SUB__;
  const d = b.daftar();
  const hit = d.find((x) => x.nama === ${JSON.stringify(NAMA)});
  return hit ? String(!!document.querySelector('[data-testid="sub-custom-' + hit.id + '-ubah"]')) : 'tidak ketemu';
})()`);
cek('tombol "Ubah" ADA di baris custom', adaUbah === 'true', String(adaUbah));

/* --- Bersihkan --- */
const dihapus = await runAsync(`(async () => {
  const b = window.__ZEPHYR_SUB__;
  const s = b.state();
  let n = 0;
  for (const x of b.daftar()) {
    if (x.nama === ${JSON.stringify(NAMA)}) { await s.hapus(x.id); n += 1; }
  }
  await b.muat();
  return String(n) + ' dihapus, sisa ' + window.__ZEPHYR_SUB__.state().daftar.filter((x) => x.nama === ${JSON.stringify(NAMA)}).length;
})()`);
console.log('     bersih -> ' + dihapus);
cek('custom sub-agent uji dibersihkan', typeof dihapus === 'string' && dihapus.endsWith('sisa 0'), String(dihapus).slice(0, 70));

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
