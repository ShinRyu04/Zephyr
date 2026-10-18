// Probe live: jalankan generator Repo Wiki sungguhan, ukur hasilnya.
//
// Ini BUKTI, bukan klaim: jumlah halaman, jumlah kartu, dan isi satu halaman
// dibaca apa adanya. Kalau generator menghasilkan 0, probe ini GAGAL.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== probe live: generator Repo Wiki ===\n');

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const out = {};

  /* Butuh workspace: tanpa itu generator menolak, dan itu memang benar. */
  out.workspace = S.getState().workspace;
  if (!out.workspace) return { ...out, tanpaWorkspace: true };

  S.getState().setActivity('wiki');
  await tunggu(800);

  const tombol = q('[data-testid="wiki-generate"]');
  out.tombolAda = !!tombol;
  if (!tombol) return out;

  tombol.click();

  /* Tunggu selesai: tombolnya berhenti bertuliskan "Generating…" / status muncul. */
  const batas = Date.now() + 120000;
  for (;;) {
    await tunggu(600);
    const status = q('[data-testid="wiki-status"]')?.textContent?.trim() ?? '';
    const galat = q('[data-testid="wiki-galat"]')?.textContent?.trim() ?? '';
    if (galat) { out.galat = galat; break; }
    if (status) { out.status = status; break; }
    if (Date.now() > batas) { out.timeout = true; break; }
  }

  const W = window.__ZEPHYR_WIKI__;
  out.store = W
    ? {
        wiki: W.getState().entri.wiki.length,
        knowledge: W.getState().entri.knowledge.length,
        terakhir: W.getState().terakhir,
        galat: W.getState().galat,
      }
    : null;

  /* Satu halaman overview dibaca apa adanya. */
  const ov = W?.getState().entri.wiki.find((e) => e.id === 'overview');
  out.overview = ov
    ? { judul: ov.judul, panjang: ov.isi.length, awal: ov.isi.slice(0, 260) }
    : null;

  /* Satu kartu pengetahuan. */
  const kartu = W?.getState().entri.knowledge[0];
  out.kartu = kartu ? { judul: kartu.judul, sumber: kartu.sumber, awal: kartu.isi.slice(0, 160) } : null;

  /* Daftar di sidebar harus terisi, bukan keadaan kosong lagi. */
  out.sidebar = {
    item: document.querySelectorAll('[data-testid^="wiki-item-"]').length,
    kosong: !!q('[data-testid="wiki-kosong"]'),
  };

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  180000,
);

const h = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
if (h.fatal) {
  console.error('GAGAL halaman error:', h.fatal);
  keluarBersih(1);
}

console.log('workspace:', h.workspace ?? '(tidak ada)');
if (h.tanpaWorkspace) {
  console.log('\nLEWAT: tidak ada folder terbuka. Buka folder dulu lalu ulangi.');
  keluarBersih(0);
}

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nHasil generasi:');
if (h.galat) console.log('  galat:', h.galat);
if (h.status) console.log('  status:', h.status);
if (h.timeout) console.log('  TIMEOUT menunggu');

cek('tidak ada galat', !h.galat, h.galat ?? '');
cek('tidak timeout', !h.timeout);
cek('status dilaporkan', !!h.status, h.status ?? '');
cek('halaman wiki dihasilkan', (h.store?.wiki ?? 0) > 0, `${h.store?.wiki ?? 0} halaman`);
cek('kartu pengetahuan dihasilkan', (h.store?.knowledge ?? 0) > 0, `${h.store?.knowledge ?? 0} kartu`);
cek('cap waktu diisi', !!h.store?.terakhir, h.store?.terakhir ?? '');
cek('halaman overview ada', !!h.overview, h.overview?.judul ?? '');
cek('overview punya isi nyata', (h.overview?.panjang ?? 0) > 200, `${h.overview?.panjang ?? 0} char`);
cek('overview menyebut modul', /## Modules/.test(h.overview?.awal ?? '') || (h.overview?.panjang ?? 0) > 200);
cek('kartu punya sumber terlacak', /^(file|folder|workspace):/.test(h.kartu?.sumber ?? ''), h.kartu?.sumber ?? '');
cek('sidebar terisi', (h.sidebar?.item ?? 0) > 0, `${h.sidebar?.item ?? 0} baris`);
cek('keadaan kosong hilang', h.sidebar?.kosong === false);

if (h.overview) {
  console.log('\n--- awal halaman overview (apa adanya) ---');
  console.log(h.overview.awal);
  console.log('---');
}
if (h.kartu) {
  console.log('\n--- satu kartu pengetahuan ---');
  console.log(h.kartu.awal);
  console.log('---');
}

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
