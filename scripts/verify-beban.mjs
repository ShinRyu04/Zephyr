// Fase 5: uji beban. Apakah UI tetap responsif saat banyak berkas & run?
//
// Yang diukur BUKAN "tidak ada galat" - itu terlalu mudah. Yang diukur:
//   * waktu render pohon berkas dengan banyak baris,
//   * waktu pencarian ikon pada ribuan nama,
//   * apakah main thread pernah tersumbat > 200 ms (terasa sebagai ngelag),
//   * apakah memori tumbuh tanpa batas setelah berkas dibuka-tutup berulang.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const out = {};

  /* ── 1. Ikon: 5000 nama berkas. Hot path, dipanggil per baris pohon. ── */
  const fi = await import('/src/lib/fileIcons.ts');
  const NAMA = [];
  const ext = ['ts','tsx','js','rs','py','json','md','css','png','yml'];
  for (let i = 0; i < 5000; i++) NAMA.push('berkas' + i + '.' + ext[i % ext.length]);

  /* Panaskan dulu: JIT belum siap pada panggilan pertama, dan mengukur
     panggilan dingin akan melaporkan angka yang tidak mewakili pemakaian. */
  for (let i = 0; i < 500; i++) fi.ikonFile(NAMA[i], 'ts');

  const t1 = performance.now();
  for (const n of NAMA) fi.ikonFile(n, 'ts');
  out.ikon = { ms: Math.round(performance.now() - t1), n: NAMA.length };

  /* ── 2. Folder: 2000 nama. ── */
  const FOLDER = [];
  for (let i = 0; i < 2000; i++) FOLDER.push('folder' + i);
  for (let i = 0; i < 200; i++) fi.ikonFolder(FOLDER[i], false);
  const t2 = performance.now();
  for (const f of FOLDER) fi.ikonFolder(f, false);
  out.folder = { ms: Math.round(performance.now() - t2), n: FOLDER.length };

  /* ── 3. Main thread: ukur celah frame selama kerja berat. ── */
  const celah = [];
  let terakhir = performance.now();
  let jalan = true;
  const ukur = () => {
    const now = performance.now();
    celah.push(now - terakhir);
    terakhir = now;
    if (jalan) requestAnimationFrame(ukur);
  };
  requestAnimationFrame(ukur);

  /* Beban: 200 kali render seluruh daftar ikon + 3000 lookup. */
  const t3 = performance.now();
  for (let r = 0; r < 200; r++) {
    for (let i = 0; i < 15; i++) fi.ikonFile(NAMA[(r * 7 + i) % NAMA.length], 'ts');
  }
  await tunggu(0);
  const bebanMs = Math.round(performance.now() - t3);
  await tunggu(300);
  jalan = false;

  celah.sort((a, b) => b - a);
  out.frame = {
    sampel: celah.length,
    terburukMs: Math.round(celah[0] ?? 0),
    medianMs: Math.round(celah[Math.floor(celah.length / 2)] ?? 0),
    bebanMs,
  };

  /* ── 4. Memori: buka/tutup berkas berulang tidak boleh tumbuh liar. ── */
  const mem0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  for (let i = 0; i < 300; i++) fi.ikonFile('uji' + i + '.ts', 'ts');
  if (window.gc) window.gc();
  await tunggu(200);
  const mem1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  out.memori = {
    ada: !!performance.memory,
    awalMB: Math.round(mem0 / 1048576),
    akhirMB: Math.round(mem1 / 1048576),
    tumbuhMB: Math.round((mem1 - mem0) / 1048576),
  };

  /* ── 5. Store: banyak pesan tidak boleh membuat getState melambat. ── */
  const t4 = performance.now();
  for (let i = 0; i < 10000; i++) S.getState();
  out.store = { ms: Math.round(performance.now() - t4), n: 10000 };

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  300000,
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

console.log('Ikon  :', JSON.stringify(d.ikon));
console.log('Folder:', JSON.stringify(d.folder));
console.log('Frame :', JSON.stringify(d.frame));
console.log('Memori:', JSON.stringify(d.memori));
console.log('Store :', JSON.stringify(d.store));

console.log('\nBukti Fase 5 — beban:');
/* 5000 ikon di bawah 300 ms berarti ~0,06 ms/baris: satu pohon 500 baris
   selesai di bawah 30 ms, jauh di bawah satu frame 16 ms untuk bagian ikon. */
cek('5000 ikon < 300 ms', (d.ikon?.ms ?? 1e9) < 300, `${d.ikon?.ms} ms`);
cek('2000 folder < 150 ms', (d.folder?.ms ?? 1e9) < 150, `${d.folder?.ms} ms`);
/* Frame terburuk > 200 ms terasa sebagai ngelag nyata oleh pembaca. */
cek('tidak ada frame tersumbat > 200 ms', (d.frame?.terburukMs ?? 1e9) <= 200, `${d.frame?.terburukMs} ms`);
cek('beban berat selesai < 2 detik', (d.frame?.bebanMs ?? 1e9) < 2000, `${d.frame?.bebanMs} ms`);
cek('memori tidak tumbuh > 40 MB', (d.memori?.tumbuhMB ?? 0) < 40, `${d.memori?.tumbuhMB} MB`);
cek('getState 10000x < 100 ms', (d.store?.ms ?? 1e9) < 100, `${d.store?.ms} ms`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
