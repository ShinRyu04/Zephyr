// Bukti Fase 4: notifikasi AI hanya saat run panjang + jendela tidak fokus.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  const n = await import('/src/lib/notifikasiAi.ts');
  out.api = {
    adaCatatMulai: typeof n.catatMulaiRun === 'function',
    adaCatatSelesai: typeof n.catatSelesaiRun === 'function',
    adaLupakan: typeof n.lupakanRun === 'function',
    adaJumlah: typeof n.jumlahRunDilacak === 'function',
    adaRiwayat: typeof n.riwayatNotifikasi === 'function',
  };

  const fokusAsli = document.hasFocus;

  /* 1. Run PENDEK (2 detik), jendela tidak fokus: dicatat, tapi TIDAK dikirim. */
  document.hasFocus = () => false;
  n.catatMulaiRun('uji-pendek', Date.now() - 2_000);
  n.catatSelesaiRun('uji-pendek', 'Zephyr', 'selesai cepat');
  await tunggu(250);

  const r1 = n.riwayatNotifikasi();
  out.pendek = { jumlah: r1.length, terakhir: r1[r1.length - 1] ?? null };

  /* 2. Run PANJANG (30 detik), tidak fokus: HARUS lolos gate. */
  n.catatMulaiRun('uji-panjang', Date.now() - 30_000);
  n.catatSelesaiRun('uji-panjang', 'Zephyr — run finished', 'Delapan berkas diubah.');
  await tunggu(250);

  const r2 = n.riwayatNotifikasi();
  out.panjang = { jumlah: r2.length, terakhir: r2[r2.length - 1] ?? null };

  /* 3. Run PANJANG tapi jendela FOKUS: dicatat fokus=true, tidak dikirim. */
  document.hasFocus = () => true;
  n.catatMulaiRun('uji-fokus', Date.now() - 30_000);
  n.catatSelesaiRun('uji-fokus', 'Zephyr', 'selesai');
  await tunggu(250);

  const r3 = n.riwayatNotifikasi();
  out.fokus = { jumlah: r3.length, terakhir: r3[r3.length - 1] ?? null };

  document.hasFocus = fokusAsli;

  /* 4. Run yang dibatalkan bisa dilupakan tanpa notifikasi. */
  n.catatMulaiRun('uji-batal', Date.now() - 60_000);
  n.lupakanRun('uji-batal');
  out.lacakSetelahLupakan = n.jumlahRunDilacak();

  /* 5. Perintah Rust benar-benar terdaftar dan menjawab. */
  const cmd = await import('/src/lib/commands.ts');
  out.notifyAda = typeof cmd.notifyShow === 'function';
  out.kosong = await cmd.notifyShow('   ', '   ');
  out.nyata = await cmd.notifyShow('Zephyr', 'Harness Fase 4');

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  180000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('API:', JSON.stringify(d.api));
console.log('pendek :', JSON.stringify(d.pendek));
console.log('panjang:', JSON.stringify(d.panjang));
console.log('fokus  :', JSON.stringify(d.fokus));

/** Sent when the gate passed: long enough AND not focused. The default
 *  threshold is 5 s (Settings > Conversation > Notify Only for Long Tasks). */
const AMBANG = 5000;
const dikirim = (x) => x && x.lama >= AMBANG && x.fokus === false;

console.log('\nBukti Fase 4 — notifikasi AI:');
cek('modul notifikasi lengkap', Object.values(d.api ?? {}).every(Boolean), JSON.stringify(d.api));
cek('run pendek DICATAT', (d.pendek?.jumlah ?? 0) === 1, String(d.pendek?.jumlah));
cek('run pendek TIDAK dikirim', !dikirim(d.pendek?.terakhir), JSON.stringify(d.pendek?.terakhir?.lama));
cek('run panjang DICATAT', (d.panjang?.jumlah ?? 0) === 2, String(d.panjang?.jumlah));
cek('run panjang + tidak fokus -> DIKIRIM', dikirim(d.panjang?.terakhir), JSON.stringify(d.panjang?.terakhir));
cek('isi notifikasi memuat ringkasan', /Delapan berkas/.test(d.panjang?.terakhir?.isi ?? ''), String(d.panjang?.terakhir?.isi));
cek('run panjang + FOKUS -> TIDAK dikirim', d.fokus?.terakhir?.fokus === true, JSON.stringify(d.fokus?.terakhir?.fokus));
cek('run dibatalkan bisa dilupakan', d.lacakSetelahLupakan === 0, String(d.lacakSetelahLupakan));
cek('command notifyShow ada di JS', d.notifyAda === true);
cek('judul/isi kosong -> false tanpa efek', d.kosong === false, String(d.kosong));
cek('panggilan nyata tidak melempar', typeof d.nyata === 'boolean', String(d.nyata));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
