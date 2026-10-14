/**
 * util-tunggu-idle.mjs — tunggu sampai `agentBusy` benar-benar tenang.
 *
 * `agentBusy` dipakai semua harness sebagai "run selesai", padahal ia bisa
 * berkedip false sesaat di tengah run (mis. saat batas putaran / giliran alat
 * selesai tapi loop belum menyusun langkah berikutnya). Harness yang percaya satu
 * pembacaan lalu menembak run berikutnya bisa MENUMPUK dua run di satu sesi:
 * tugas kedua masuk sebagai sisipan di dalam run pertama, berkas hasilnya
 * mendarat di workspace yang lama, dan setiap angka yang dilaporkan salah.
 *
 * Jadi di sini yang diperiksa bukan "busy=false sekali", tapi "busy=false
 * selama beberapa detik berturut-turut" (`STABIL` detik, bawaan 12).
 *
 *   node scripts/util-tunggu-idle.mjs [port]
 *   Env: STABIL=12, MENIT=5
 *   exit 0 = tenang, 1 = masih sibuk sampai batas waktu, 3 = app tidak terjawab
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const STABIL = Number(process.env.STABIL ?? 12);
const MENIT = Number(process.env.MENIT ?? 5);

/* Baris ini sengaja dicetak SEBELUM attach: kalau prosesnya mati saat attach, log yang
   cuma berisi baris ini membuktikan skripnya jalan tapi app tidak terjawab - beda hal
   dengan skrip yang tidak pernah jalan (log kosong). */
console.log(`     menunggu idle di port ${PORT} (perlu tenang ${STABIL}s, batas ${MENIT} menit)...`);

let cdp;
try {
  ({ cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']));
} catch (e) {
  console.log(`     GAGAL attach ke ${PORT}: ${String((e && e.message) || e)}`);
  console.log('     (exit 3 = app tidak terjawab / debug port tidak hidup, bukan "masih sibuk")');
  process.exit(3);
}
const t0 = Date.now();
let tenangDari = null;

while (Date.now() - t0 < MENIT * 60000) {
  const s = await cdp.json(
    `return JSON.stringify({
      busy: window.__ZEPHYR_AI__.store.getState().agentBusy,
      langkah: (window.__ZEPHYR_AI__.store.getState().agentSteps || []).length,
    })`,
    30000,
  );
  if (s.busy) {
    tenangDari = null;
    process.stdout.write(`     masih sibuk (langkah ${s.langkah}, ${Math.round((Date.now() - t0) / 1000)}s)\n`);
  } else if (tenangDari === null) {
    tenangDari = Date.now();
  } else if (Date.now() - tenangDari >= STABIL * 1000) {
    console.log(`     tenang: busy=false stabil ${STABIL}s pada langkah ${s.langkah} (${Math.round((Date.now() - t0) / 1000)}s)`);
    await cdp.close();
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.log('     MASIH SIBUK sampai batas waktu (bukan app mati: attach berhasil).');
await cdp.close();
process.exit(1);
