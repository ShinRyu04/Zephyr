/**
 * uji-realpath-baca-kode.mjs - buktikan jembatan baca-kode memakai realpath
 * SUNGGUHAN: tautan (junction) yang menunjuk KELUAR akar harus DITOLAK,
 * sementara berkas di DALAM akar tetap terbaca.
 *
 *   node scripts/uji-realpath-baca-kode.mjs [port]
 *
 * Lewat jalur NYATA yang dipakai app (`jalankanAgentTool('zephyr_kode', ...)`),
 * karena jembatan dipasang lazy tepat sebelum tool dijalankan.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const AKAR = 'D:\\Zephyr';
const LUAR = 'D:\\Zephyr-uji-luar';
const TAUTAN = AKAR + '\\scratch\\tautan-uji-luar';

mkdirSync(LUAR, { recursive: true });
mkdirSync(AKAR + '\\scratch', { recursive: true });
if (existsSync(TAUTAN)) rmSync(TAUTAN, { recursive: true, force: true });
try {
  execFileSync('cmd', ['/C', 'mklink', '/J', TAUTAN, LUAR], { stdio: 'pipe' });
  console.log('junction dibuat :', TAUTAN, '->', LUAR);
} catch (e) {
  console.log('GAGAL membuat junction:', String(e).slice(0, 200));
}

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  /*
   * Lewat jembatan dev __ZEPHYR_TOOLS__, BUKAN import().
   *
   * Setelah HMR, vite menyajikan modul yang sama di bawah URL berbeda dan
   * import() mengembalikan SALINAN modul yang lain: jembatan yang dipasang di
   * salinan itu tidak pernah terlihat oleh modul yang benar-benar dipakai app,
   * sehingga tool selalu menjawab "belum tersambung". Jembatan dev menunjuk
   * instance yang sama dengan UI.
   */
  const at = window.__ZEPHYR_TOOLS__;
  const out = {};
  /* Buka folder lewat jembatan __ZEPHYR__ - instance yang SAMA dengan app.
     Import store sendiri mengembalikan salinan lain, dan membuka workspace di
     salinan itu tidak terlihat oleh modul yang dipakai app. */
  if (window.__ZEPHYR__.getState().workspace !== 'D:/Zephyr') {
    await window.__ZEPHYR__.getState().openWorkspace('D:/Zephyr');
    await new Promise((res) => setTimeout(res, 2500));
  }
  out.workspace = window.__ZEPHYR__.getState().workspace;
  try { out.lewatTautan = await at.jalankanAgen('zephyr_kode', { berkas: 'scratch/tautan-uji-luar/rahasia.txt' }); }
  catch (e) { out.lewatTautan = 'THROW: ' + String(e && e.message ? e.message : e); }
  out.adaJembatan = 'lewat bridge';
  try { out.dalamAkar = await at.jalankanAgen('zephyr_kode', { berkas: 'package.json' }); }
  catch (e) { out.dalamAkar = 'THROW: ' + String(e && e.message ? e.message : e); }
  return out;
`);
const s = typeof r === 'string' ? JSON.parse(r) : r;
const teks = (x) => (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500);

console.log('workspace    :', s.workspace);
console.log('ada jembatan :', s.adaJembatan);
console.log('--- lewat TAUTAN (harus DITOLAK) ---');
console.log(teks(s.lewatTautan));
console.log('--- di DALAM akar (harus DIBACA) ---');
console.log(teks(s.dalamAkar));

const tTolak = /KELUAR akar|tautan|ditolak|tidak bisa diverifikasi|belum tersambung/i.test(teks(s.lewatTautan));
const tBaca = /"name"|zephyr|package/i.test(teks(s.dalamAkar)) && !/belum tersambung/i.test(teks(s.dalamAkar));
console.log('\nHASIL:', tTolak && tBaca
  ? 'OK - tautan keluar akar ditolak, berkas di dalam akar terbaca'
  : 'GAGAL - tolakTautan=' + tTolak + ' bacaDalam=' + tBaca);

rmSync(TAUTAN, { recursive: true, force: true });
rmSync(LUAR, { recursive: true, force: true });
console.log('dibersihkan:', !existsSync(TAUTAN) && !existsSync(LUAR) ? 'YA' : 'TIDAK');
await cdp.close();
