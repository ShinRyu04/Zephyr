/**
 * util-muat-ulang.mjs — muat ulang halaman Zephyr lewat CDP, lalu tunggu siap.
 *
 * Bridge dev (`window.__ZEPHYR_*__`) dipasang sekali saat modul `devBridge.ts`
 * pertama kali dievaluasi. Sesudah bridge itu ditambah bridge baru, app yang
 * sedang jalan belum memilikinya, dan harness akan berhenti dengan pesan
 * "bridge belum ada" - yang terlihat seperti kegagalan kode, padahal cuma app
 * yang belum dimuat ulang. Skrip ini menutup celah itu.
 *
 *   node scripts/util-muat-ulang.mjs [port] [--tunggu-fn=<namaBridge>]
 */
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const perlu = (process.argv.find((a) => a.startsWith('--tunggu-fn=')) ?? '').split('=')[1] || '';

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
/* `location.reload()` lewat Runtime.evaluate: evaluasinya sendiri mati bersama
   konteks lama, jadi galatnya diabaikan dan kesiapan diperiksa dengan polling. */
try {
  await cdp.eval('location.reload()');
} catch {
  /* konteks hancur karena reload: memang begitu */
}

let ok = false;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  try {
    const jawab = await cdp.json(
      `return JSON.stringify({ ada: !!window.__ZEPHYR_AI__, fn: ${perlu ? `typeof window.__ZEPHYR_AI__[${JSON.stringify(perlu)}]` : `'skip'`}, judul: document.title })`,
    );
    if (jawab.ada && (jawab.fn === 'function' || jawab.fn === 'skip')) {
      console.log(`     app siap: ${jawab.judul}${perlu ? `, __ZEPHYR_AI__.${perlu} ada` : ''} (${i + 1}s)`);
      ok = true;
      break;
    }
  } catch {
    /* halaman sedang dimuat: koneksi evaluasi bisa gagal sesaat */
  }
}
await cdp.close();
if (!ok) {
  console.log('     GAGAL: app tidak siap sesudah 60s.');
  process.exit(1);
}
